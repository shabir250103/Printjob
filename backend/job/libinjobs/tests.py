from decimal import Decimal
from datetime import timedelta
from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    CashAccount, CashTransaction, CashTransfer, Customer, CustomerPayment, CustomerType,
    Delivery, Department, InJob, InJobDropdownOption, Invoice, JobDocument, Machine, MachineCounter,
    MachineStatusHistory, OutJob, PipelineJob, StockItem, StockMovement,
    VendorPayment, WastageRecord, FollowUp, ModulePermissionOverride,
    Notification, Role, UserProfile,
)


def grant_test_access(user):
    role = Role.objects.create(name=f'Test role {user.username}', default_permissions={module: True for module, _ in ModulePermissionOverride.MODULES})
    UserProfile.objects.create(user=user, role=role)


class MasterDataApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='tester', password='test-pass-123')
        grant_test_access(self.user)
        self.client.force_authenticate(self.user)

    def test_department_slug_is_generated(self):
        response = self.client.post(reverse('libinjobs:department-list'), {'name': 'Print Floor'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['slug'], 'print-floor')
        self.assertTrue(Department.objects.filter(slug='print-floor').exists())

    def test_customer_requires_valid_gst_length_when_present(self):
        customer_type = CustomerType.objects.create(name='Corporate')
        response = self.client.post(
            reverse('libinjobs:customer-list'),
            {'name': 'Example Client', 'gst_number': 'SHORT', 'customer_type': customer_type.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('gst_number', response.data)

    def test_customer_contact_and_address_fields_round_trip(self):
        response = self.client.post(reverse('libinjobs:customer-list'), {
            'name': 'Vignesh', 'mobile': '9344078224', 'email': 'vignesh@example.com',
            'billing_address': 'Billing street', 'delivery_address': 'Delivery street',
            'notes': 'Call before delivery',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        customer = Customer.objects.get(pk=response.data['id'])
        self.assertEqual(customer.mobile, '9344078224')
        self.assertEqual(customer.email, 'vignesh@example.com')
        self.assertEqual(customer.billing_address, 'Billing street')
        self.assertEqual(customer.delivery_address, 'Delivery street')
        self.assertEqual(customer.notes, 'Call before delivery')

    def test_customer_rejects_invalid_email(self):
        response = self.client.post(reverse('libinjobs:customer-list'), {
            'name': 'Vignesh', 'email': 'not-an-email',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_machine_breakdown_requires_reason(self):
        response = self.client.post(
            reverse('libinjobs:machine-list'),
            {'code': 'M-1', 'name': 'Press One', 'operational_status': Machine.OperationalStatus.BREAKDOWN},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('status_reason', response.data)

    def test_machine_counter_tracks_daily_readings_and_job_clicks(self):
        machine = Machine.objects.create(code='COUNTER-1', name='Counter Press')
        InJob.objects.create(
            customer_name='Counter Customer', job_type='Cards', created_by=self.user,
            machine=machine, job_date=timezone.localdate(), sheet_count=12,
            side_mode='DS', click_count=24,
        )
        url = reverse('libinjobs:machinecounter-list')
        response = self.client.post(url, {
            'machine': machine.pk, 'count_date': timezone.localdate().isoformat(),
            'morning_count': 1000, 'ending_count': 1030,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['actual_clicks'], 30)
        self.assertEqual(response.data['job_clicks_booked'], 24)
        self.assertEqual(response.data['difference'], 6)
        counter = MachineCounter.objects.get(machine=machine, count_date=timezone.localdate())
        self.assertEqual(counter.operator, self.user)

        changed = self.client.patch(reverse('libinjobs:machinecounter-detail', args=(counter.pk,)), {
            'morning_count': 1005, 'ending_count': 1035,
        }, format='json')
        self.assertEqual(changed.status_code, status.HTTP_200_OK, changed.data)
        self.assertEqual(changed.data['actual_clicks'], 30)
        self.assertEqual(changed.data['difference'], 6)

        created_job = self.client.post(reverse('libinjobs:injob-list'), {
            'customer_name': 'Automatic Click Customer', 'job_type': 'Cards', 'machine': machine.pk,
            'side_mode': 'DS', 'sheet_count': 10, 'click_count': 999,
        }, format='json')
        self.assertEqual(created_job.status_code, status.HTTP_201_CREATED, created_job.data)
        accepted = self.client.post(reverse('libinjobs:injob-accept', args=(created_job.data['id'],)), format='json')
        self.assertEqual(accepted.status_code, status.HTTP_200_OK, accepted.data)
        self.assertEqual(accepted.data['click_count'], 20)
        counter_response = self.client.get(reverse('libinjobs:machinecounter-detail', args=(counter.pk,)))
        self.assertEqual(counter_response.data['job_clicks_booked'], 44)

        updated_job = self.client.patch(reverse('libinjobs:injob-detail', args=(created_job.data['id'],)), {
            'sheet_count': 15,
        }, format='json')
        self.assertEqual(updated_job.status_code, status.HTTP_200_OK, updated_job.data)
        self.assertEqual(updated_job.data['click_count'], 30)
        counter_response = self.client.get(reverse('libinjobs:machinecounter-detail', args=(counter.pk,)))
        self.assertEqual(counter_response.data['job_clicks_booked'], 54)

        daily = self.client.get(reverse('libinjobs:machinecounter-daily'), {'date': timezone.localdate().isoformat()})
        self.assertEqual(daily.status_code, status.HTTP_200_OK, daily.data)
        daily_row = next(row for row in daily.data['machines'] if row['machine_id'] == machine.pk)
        self.assertEqual(daily_row['job_clicks_booked'], 54)
        self.assertEqual(daily_row['difference'], -24)

        no_readings_machine = Machine.objects.create(code='COUNTER-2', name='Second Press')
        InJob.objects.create(
            customer_name='No Reading Customer', job_type='Cards', created_by=self.user,
            machine=no_readings_machine, job_date=timezone.localdate(), sheet_count=7,
            side_mode='DS', click_count=14,
        )
        daily = self.client.get(reverse('libinjobs:machinecounter-daily'), {'date': timezone.localdate().isoformat()})
        no_readings_row = next(row for row in daily.data['machines'] if row['machine_id'] == no_readings_machine.pk)
        self.assertEqual(no_readings_row['counter_id'], None)
        self.assertEqual(no_readings_row['job_clicks_booked'], 14)
        self.assertIsNone(no_readings_row['difference'])

        duplicate = self.client.post(url, {
            'machine': machine.pk, 'count_date': timezone.localdate().isoformat(),
            'morning_count': 0, 'ending_count': 0,
        }, format='json')
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

        invalid = self.client.patch(reverse('libinjobs:machinecounter-detail', args=(counter.pk,)), {
            'ending_count': 1000,
        }, format='json')
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_machine_day_carries_forward_ending_as_morning_and_resets_daily_clicks(self):
        machine = Machine.objects.create(code='ROLLOVER-1', name='Rollover Press')
        yesterday = timezone.localdate() - timedelta(days=1)
        today = timezone.localdate()
        MachineCounter.objects.create(
            machine=machine, operator=self.user, count_date=yesterday,
            morning_count=1600, ending_count=2058,
        )

        response = self.client.get(reverse('libinjobs:machinecounter-daily'), {'date': today.isoformat()})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data['machines'] if item['machine_id'] == machine.pk)
        self.assertIsNone(row['counter_id'])
        self.assertEqual(row['morning_count'], 2058)
        self.assertIsNone(row['ending_count'])
        self.assertIsNone(row['actual_clicks'])
        self.assertEqual(row['job_clicks_booked'], 0)

    def test_low_stock_filter(self):
        StockItem.objects.create(name='A3 Paper', current_stock=10, min_stock=20)
        StockItem.objects.create(name='A4 Paper', current_stock=100, min_stock=20)
        response = self.client.get(reverse('libinjobs:stockitem-list'), {'low_stock': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'A3 Paper')


class JobWorkflowApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='workflow-user', password='test-pass-123')
        grant_test_access(self.user)
        self.client.force_authenticate(self.user)

    def create_pipeline(self):
        response = self.client.post(
            reverse('libinjobs:pipelinejob-list'),
            {
                'client_name': 'Sample Customer',
                'contact_number': '9999999999',
                'job_type': 'Business Cards',
                'quantity': 500,
                'priority': 'high',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return PipelineJob.objects.get(pk=response.data['id'])

    def test_superadmin_can_bulk_assign_only_unaccepted_pending_in_jobs(self):
        superadmin = get_user_model().objects.create_superuser(username='bulk-superadmin', password='test-pass-123')
        worker = get_user_model().objects.create_user(username='bulk-worker')
        grant_test_access(worker)
        job = InJob.objects.create(customer_name='Bulk Customer', job_type='Cards', created_by=superadmin)
        self.client.force_authenticate(superadmin)
        response = self.client.post(reverse('libinjobs:injob-bulk-assign'), {
            'job_ids': [job.pk], 'user_ids': [worker.pk],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(list(job.assigned_users.all()), [worker])

        job.accepted_by = worker
        job.save(update_fields=('accepted_by', 'updated_at'))
        rejected = self.client.post(reverse('libinjobs:injob-bulk-assign'), {
            'job_ids': [job.pk], 'user_ids': [worker.pk],
        }, format='json')
        self.assertEqual(rejected.status_code, status.HTTP_409_CONFLICT)

        self.client.force_authenticate(self.user)
        forbidden = self.client.post(reverse('libinjobs:injob-bulk-assign'), {
            'job_ids': [job.pk], 'user_ids': [worker.pk],
        }, format='json')
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_pipeline_printing_method_and_reference_image_upload(self):
        image_data = BytesIO()
        Image.new('RGB', (2, 2), color='red').save(image_data, format='PNG')
        with TemporaryDirectory() as media_dir, override_settings(MEDIA_ROOT=media_dir):
            uploaded = SimpleUploadedFile('reference.png', image_data.getvalue(), content_type='image/png')
            created = self.client.post(reverse('libinjobs:pipelinejob-list'), {
                'client_name': 'Image customer', 'job_type': 'Poster',
                'printing_method': 'Screen Printing', 'reference_image': uploaded,
            }, format='multipart')
            self.assertEqual(created.status_code, status.HTTP_201_CREATED)
            self.assertTrue(created.data['has_reference_image'])
            self.assertNotIn('reference_image', created.data)
            job = PipelineJob.objects.get(pk=created.data['id'])
            self.assertEqual(job.printing_method, 'Screen Printing')
            image_response = self.client.get(reverse('libinjobs:pipelinejob-reference-image', args=(job.pk,)))
            self.assertEqual(image_response.status_code, status.HTTP_200_OK)
            self.assertEqual(b''.join(image_response.streaming_content), image_data.getvalue())
            image_response.close()

            restricted = get_user_model().objects.create_user(username='no-pipeline-image')
            UserProfile.objects.create(user=restricted, role=Role.objects.create(name='No pipeline access', default_permissions={'pipeline': False}))
            self.client.force_authenticate(restricted)
            self.assertEqual(self.client.get(reverse('libinjobs:pipelinejob-reference-image', args=(job.pk,))).status_code, status.HTTP_403_FORBIDDEN)
            self.client.force_authenticate(self.user)

            invalid = self.client.patch(reverse('libinjobs:pipelinejob-detail', args=(job.pk,)), {
                'reference_image': SimpleUploadedFile('bad.png', b'not an image', content_type='image/png'),
            }, format='multipart')
            self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pipeline_accepts_multiple_reference_files_and_more_on_edit(self):
        image_data = BytesIO()
        Image.new('RGB', (2, 2), color='blue').save(image_data, format='PNG')
        with TemporaryDirectory() as media_dir, override_settings(MEDIA_ROOT=media_dir):
            created = self.client.post(reverse('libinjobs:pipelinejob-list'), {
                'client_name': 'Artwork client', 'job_type': 'Poster', 'status': 'progress',
                'reference_files': [
                    SimpleUploadedFile('example.pdf', b'%PDF-1.4\n%%EOF', content_type='application/pdf'),
                    SimpleUploadedFile('design.png', image_data.getvalue(), content_type='image/png'),
                ],
            }, format='multipart')
            self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
            job = PipelineJob.objects.get(pk=created.data['id'])
            self.assertEqual(job.status, PipelineJob.Status.PROGRESS)
            self.assertCountEqual([item['name'] for item in created.data['reference_documents']], ['example.pdf', 'design.png'])
            self.assertEqual(JobDocument.objects.filter(pipeline_job=job, kind=JobDocument.Kind.REFERENCE).count(), 2)

            added = self.client.patch(reverse('libinjobs:pipelinejob-detail', args=(job.pk,)), {
                'reference_files': [SimpleUploadedFile('second.pdf', b'%PDF-1.5\n%%EOF', content_type='application/pdf')],
            }, format='multipart')
            self.assertEqual(added.status_code, status.HTTP_200_OK, added.data)
            self.assertEqual(len(added.data['reference_documents']), 3)
            document = JobDocument.objects.get(pipeline_job=job, original_name='example.pdf')
            downloaded = self.client.get(reverse('libinjobs:jobdocument-download', args=(document.pk,)))
            self.assertEqual(downloaded.status_code, status.HTTP_200_OK)
            self.assertEqual(b''.join(downloaded.streaming_content), b'%PDF-1.4\n%%EOF')
            downloaded.close()

            rejected = self.client.patch(reverse('libinjobs:pipelinejob-detail', args=(job.pk,)), {
                'reference_files': [SimpleUploadedFile('bad.txt', b'not allowed', content_type='text/plain')],
            }, format='multipart')
            self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(JobDocument.objects.filter(pipeline_job=job).count(), 3)

            restricted = get_user_model().objects.create_user(username='no-pipeline-documents')
            UserProfile.objects.create(user=restricted, role=Role.objects.create(
                name='No pipeline documents', default_permissions={'pipeline': False},
            ))
            self.client.force_authenticate(restricted)
            self.assertEqual(self.client.get(reverse('libinjobs:jobdocument-download', args=(document.pk,))).status_code, status.HTTP_404_NOT_FOUND)
            self.assertEqual(self.client.get(reverse('libinjobs:jobdocument-list')).data, [])

    def test_pipeline_job_receives_generated_number(self):
        pipeline = self.create_pipeline()
        self.assertRegex(pipeline.job_number, r'^PL-\d{4}-\d{6}$')
        self.assertEqual(pipeline.created_by, self.user)

    def test_pipeline_can_convert_to_in_job_once(self):
        pipeline = self.create_pipeline()
        url = reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,))
        response = self.client.post(url, {'reference_type': 'walkin'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(InJob.objects.count(), 1)
        converted_job = InJob.objects.get()
        self.assertEqual(converted_job.reference_type, InJob.ReferenceType.WALKIN)
        self.assertRegex(converted_job.job_number, rf'^LP\(W\)-0001_{converted_job.job_date:%d%m%Y}$')
        pipeline.refresh_from_db()
        self.assertEqual(pipeline.status, PipelineJob.Status.CONVERTED_IN)

        duplicate = self.client.post(url, {}, format='json')
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(InJob.objects.count(), 1)

    def test_direct_in_job_create_uses_full_form_autofill_and_assignment(self):
        customer = Customer.objects.create(name='Stored Buyer', mobile='9123456789')
        stock = StockItem.objects.create(name='Silk Paper', category='paper', gsm=250, size='A3')
        machine = Machine.objects.create(code='DEFAULT-CREATE', name='Default Press', is_default=True)
        worker = get_user_model().objects.create_user(username='direct-create-worker')
        grant_test_access(worker)
        department = Department.objects.create(name='Finishing Room')
        response = self.client.post(reverse('libinjobs:injob-list'), {
            'job_name': 'bas_Naidu_300gsm_DS_Matt_1+7-8sheet', 'customer': customer.pk,
            'reference_type': 'corporate',
            'stock_item': stock.pk, 'job_type': 'Business Cards', 'quantity': 100,
            'assigned_users': [worker.pk], 'everyone_in_department': department.pk,
            'total_amount': '5000.00', 'advance': '1000.00', 'expenses': '1200.00',
            'delivery_porter': True, 'regular_finish': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertNotIn('customer_name', response.data)
        job = InJob.objects.get(pk=response.data['id'])
        self.assertEqual(job.reference_type, InJob.ReferenceType.CORPORATE)
        self.assertRegex(job.job_number, rf'^LP\(C\)-0001_{job.job_date:%d%m%Y}$')
        self.assertEqual(job.job_initials, 'bas')
        self.assertEqual(job.customer_name, 'Stored Buyer')
        self.assertEqual(job.contact_number, '9123456789')
        self.assertEqual((job.paper_type, job.gsm, job.paper_size), ('Silk Paper', 250, 'A3'))
        self.assertEqual(job.side_mode, 'DS')
        self.assertEqual(job.sheet_count, 8)
        self.assertEqual(job.click_count, 16)
        self.assertEqual(job.machine, machine)
        self.assertEqual(job.gst_percent, Decimal('18.00'))
        self.assertEqual(job.balance, Decimal('4000.00'))
        self.assertEqual(job.profit, Decimal('3800.00'))
        self.assertTrue(job.delivery_porter)
        self.assertEqual(list(job.assigned_users.all()), [worker])
        self.assertEqual(list(job.assigned_departments.all()), [department])
        self.client.force_authenticate(worker)
        self.assertEqual(self.client.post(reverse('libinjobs:injob-accept', args=(job.pk,))).status_code, status.HTTP_200_OK)
        detail = self.client.get(reverse('libinjobs:injob-detail', args=(job.pk,)))
        self.assertIn('designer_display', detail.data)
        self.assertIn('machine_name', detail.data)
        self.assertEqual(detail.data['click_count'], 16)
        changed = self.client.patch(reverse('libinjobs:injob-detail', args=(job.pk,)), {'sheet_count': 4}, format='json')
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        job.refresh_from_db()
        self.assertEqual(job.click_count, 8)
        changed = self.client.patch(reverse('libinjobs:injob-detail', args=(job.pk,)), {'quantity': 250, 'side_mode': 'SS'}, format='json')
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        job.refresh_from_db()
        self.assertEqual(job.click_count, job.sheet_count)
        self.client.force_authenticate(self.user)

    def test_direct_in_job_can_link_unconverted_pipeline_once(self):
        pipeline = self.create_pipeline()
        options = self.client.get(reverse('libinjobs:injob-create-options'))
        self.assertEqual(options.status_code, status.HTTP_200_OK)
        self.assertIn(pipeline.pk, [item['id'] for item in options.data['pipeline_jobs']])
        response = self.client.post(reverse('libinjobs:injob-list'), {
            'pipeline_job': pipeline.pk, 'customer_name': 'Manual Name', 'quantity': 25,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        job = InJob.objects.get(pipeline_job=pipeline)
        self.assertEqual(job.customer_name, 'Manual Name')
        self.assertEqual(job.quantity, 25)
        self.assertEqual(job.job_type, pipeline.job_type)
        pipeline.refresh_from_db()
        self.assertEqual(pipeline.status, PipelineJob.Status.CONVERTED_IN)
        repeated = self.client.post(reverse('libinjobs:injob-list'), {'pipeline_job': pipeline.pk}, format='json')
        self.assertEqual(repeated.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(InJob.objects.count(), 1)

    def test_custom_dropdown_options_keep_fixed_workflow_meanings(self):
        url = reverse('libinjobs:injobdropdownoption-list')
        created = {}
        for field_name, label, base_value in (
            ('priority', 'Rush', 'urgent'), ('side_mode', 'Duplex', 'DS'),
            ('payment_status', 'Deposit due', 'partial'),
        ):
            response = self.client.post(url, {
                'field_name': field_name, 'label': label, 'base_value': base_value,
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
            created[field_name] = response.data['id']
        invalid = self.client.post(url, {
            'field_name': 'side_mode', 'label': 'Three sides', 'base_value': 'TS',
        }, format='json')
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(reverse('libinjobs:injob-list'), {
            'customer_name': 'Alias Client', 'job_type': 'Cards', 'quantity': 100, 'sheet_count': 5,
            'priority_option': created['priority'], 'side_option': created['side_mode'],
            'payment_option': created['payment_status'],
            'total_amount': '100.00', 'advance': '20.00',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        job = InJob.objects.get(pk=response.data['id'])
        self.assertEqual((job.priority, job.side_mode, job.payment_status), ('urgent', 'DS', 'partial'))
        self.assertEqual(job.click_count, 10)
        self.assertEqual(response.data['priority_label'], 'Rush')
        choices = self.client.get(reverse('libinjobs:injob-create-options'))
        self.assertIn(created['side_mode'], [item['id'] for item in choices.data['custom_options']['side_mode']])
        self.assertEqual(InJobDropdownOption.objects.count(), 3)

    def test_pipeline_conversion_accepts_custom_side_choice(self):
        pipeline = self.create_pipeline()
        created = self.client.post(reverse('libinjobs:injobdropdownoption-list'), {
            'field_name': 'side_mode', 'label': 'Duplex production', 'base_value': 'DS',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        converted = self.client.post(reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,)), {
            'side_option': created.data['id'], 'quantity': 50, 'sheet_count': 3,
        }, format='json')
        self.assertEqual(converted.status_code, status.HTTP_201_CREATED, converted.data)
        job = InJob.objects.get(pipeline_job=pipeline)
        self.assertEqual(job.side_mode, 'DS')
        self.assertEqual(job.click_count, 6)
        self.assertEqual(job.side_option.label, 'Duplex production')

    def test_custom_options_require_in_job_permission(self):
        restricted = get_user_model().objects.create_user(username='no-injob-options')
        UserProfile.objects.create(user=restricted, role=Role.objects.create(
            name='No In Job options', default_permissions={'injobs': False},
        ))
        self.client.force_authenticate(restricted)
        url = reverse('libinjobs:injobdropdownoption-list')
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(url, {
            'field_name': 'job_type', 'label': 'New type',
        }, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_conversion_collects_full_in_job_form_and_calculates_counts(self):
        pipeline = self.create_pipeline()
        customer = Customer.objects.create(name='Stored Customer', mobile='9123456789')
        stock = StockItem.objects.create(name='Art Paper', category='paper', gsm=250, size='A3')
        machine = Machine.objects.create(code='DEFAULT-1', name='Default Press', is_default=True)
        worker = get_user_model().objects.create_user(username='conversion-worker')
        department = Department.objects.create(name='Print Room')
        response = self.client.post(reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,)), {
            'job_name': 'bas_Naidu_300gsm_DS_Matt_1+7-8sheet', 'customer': customer.pk,
            'stock_item': stock.pk, 'assigned_users': [worker.pk], 'everyone_in_department': department.pk,
            'morning_count': 159801, 'counter_click_count': 467, 'quantity': 100,
            'total_amount': '5000.00', 'advance': '2000.00', 'expenses': '1200.00',
            'delivery_courier': True, 'regular_finish': True, 'gst_percent': '18.00',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        job = InJob.objects.get()
        self.assertEqual(job.job_initials, 'bas')
        self.assertEqual(job.customer_name, 'Stored Customer')
        self.assertEqual(job.contact_number, '9123456789')
        self.assertEqual(job.paper_type, 'Art Paper')
        self.assertEqual(job.gsm, 250)
        self.assertEqual(job.paper_size, 'A3')
        self.assertEqual(job.side_mode, 'DS')
        self.assertEqual(job.sheet_count, 8)
        self.assertEqual(job.click_count, 16)
        self.assertEqual(job.current_count, 160268)
        self.assertEqual(job.machine, machine)
        self.assertEqual(job.balance, Decimal('3000.00'))
        self.assertEqual(job.profit, Decimal('3800.00'))
        self.assertTrue(job.delivery_courier)
        self.assertEqual(list(job.assigned_users.all()), [worker])
        self.assertEqual(list(job.assigned_departments.all()), [department])

    def test_conversion_manual_fields_override_name_customer_and_stock(self):
        pipeline = self.create_pipeline()
        customer = Customer.objects.create(name='Stored Customer', mobile='9123456789')
        stock = StockItem.objects.create(name='Art Paper', gsm=250, size='A3')
        response = self.client.post(reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,)), {
            'job_name': 'bas_Naidu_300gsm_SS_Matt_1+7-8sheet', 'customer': customer.pk,
            'stock_item': stock.pk, 'customer_name': 'Manual Customer', 'contact_number': '9000000000',
            'paper_type': 'Manual Paper', 'gsm': 350, 'paper_size': 'A4', 'sheet_count': 4,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        job = InJob.objects.get()
        self.assertEqual((job.customer_name, job.contact_number), ('Manual Customer', '9000000000'))
        self.assertEqual((job.paper_type, job.gsm, job.paper_size), ('Manual Paper', 350, 'A4'))
        self.assertEqual(job.sheet_count, 4)

    def test_conversion_options_include_stock_across_categories(self):
        pipeline = self.create_pipeline()
        StockItem.objects.create(name='Paper', category='paper')
        StockItem.objects.create(name='Gift Material', category='other')
        response = self.client.get(reverse('libinjobs:pipelinejob-in-job-options', args=(pipeline.pk,)))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual({item['name'] for item in response.data['stock_items']}, {'Paper', 'Gift Material'})

    def test_invalid_advance_does_not_convert_pipeline(self):
        pipeline = self.create_pipeline()
        response = self.client.post(reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,)), {
            'total_amount': '100.00', 'advance': '200.00',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(InJob.objects.exists())
        pipeline.refresh_from_db()
        self.assertEqual(pipeline.status, PipelineJob.Status.NEW)

    def test_out_job_conversion_requires_vendor(self):
        pipeline = self.create_pipeline()
        url = reverse('libinjobs:pipelinejob-convert-to-out-job', args=(pipeline.pk,))
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(OutJob.objects.count(), 0)

    def test_out_job_conversion_copies_pipeline_context(self):
        pipeline = self.create_pipeline()
        url = reverse('libinjobs:pipelinejob-convert-to-out-job', args=(pipeline.pk,))
        response = self.client.post(url, {'vendor': 'External Printer'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        out_job = OutJob.objects.get()
        self.assertEqual(out_job.customer_name, pipeline.client_name)
        self.assertEqual(out_job.quantity, pipeline.quantity)
        self.assertEqual(out_job.vendor, 'External Printer')

    def test_out_job_customer_selection_and_create_choices(self):
        customer = Customer.objects.create(name='Saved customer', mobile='9876543210')
        options = self.client.get(reverse('libinjobs:outjob-create-options'))
        self.assertEqual(options.status_code, status.HTTP_200_OK)
        self.assertIn(customer.pk, [item['id'] for item in options.data['customers']])
        created = self.client.post(reverse('libinjobs:outjob-list'), {
            'customer': customer.pk, 'vendor': 'Supplier', 'job_type': 'Signage',
            'quantity': 2, 'supplier_expenses': '120.00',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        job = OutJob.objects.get(pk=created.data['id'])
        self.assertEqual((job.customer_name, job.contact_number), ('Saved customer', '9876543210'))
        self.assertEqual(job.supplier_expenses, Decimal('120.00'))

    def test_out_job_conversion_accepts_details_and_assignments(self):
        pipeline = self.create_pipeline()
        department = Department.objects.create(name='Outsourcing')
        converted = self.client.post(reverse('libinjobs:pipelinejob-convert-to-out-job', args=(pipeline.pk,)), {
            'vendor': 'External Printer', 'description': 'UV finish', 'quantity': 75,
            'delivery_lp_office': True, 'supplier_expenses': '240.00',
            'assigned_users': [self.user.pk], 'assigned_departments': [department.pk],
        }, format='json')
        self.assertEqual(converted.status_code, status.HTTP_201_CREATED, converted.data)
        job = OutJob.objects.get(pipeline_job=pipeline)
        self.assertEqual((job.description, job.quantity), ('UV finish', 75))
        self.assertTrue(job.delivery_lp_office)
        self.assertEqual(job.supplier_expenses, Decimal('240.00'))
        self.assertEqual(list(job.assigned_users.values_list('pk', flat=True)), [self.user.pk])
        self.assertEqual(list(job.assigned_departments.values_list('pk', flat=True)), [department.pk])

    def test_out_job_finance_fields_require_admin(self):
        created = self.client.post(reverse('libinjobs:outjob-list'), {
            'customer_name': 'Client', 'vendor': 'Supplier', 'job_type': 'Cards', 'total_amount': '500.00',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_400_BAD_REQUEST)
        pipeline = self.create_pipeline()
        converted = self.client.post(reverse('libinjobs:pipelinejob-convert-to-out-job', args=(pipeline.pk,)), {
            'vendor': 'Supplier', 'vendor_total_payment': '200.00',
        }, format='json')
        self.assertEqual(converted.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(OutJob.objects.exists())
        self.assertNotEqual(pipeline.status, PipelineJob.Status.CONVERTED_OUT)

    def test_out_job_profit_deducts_supplier_and_other_expenses(self):
        admin = get_user_model().objects.create_superuser(username='out-admin', password='test-pass-123')
        self.client.force_authenticate(admin)
        created = self.client.post(reverse('libinjobs:outjob-list'), {
            'customer_name': 'Client', 'contact_number': '9344078224', 'vendor': 'Supplier', 'job_type': 'Cards',
            'description': 'Print two-sided cards', 'quantity': 200, 'priority': 'high',
            'delivery_date': '2026-10-28', 'delivery_lp_office': True, 'delivery_porter': False,
            'delivery_courier': True, 'remarks': 'Pack separately',
            'supplier_expenses': '120.00', 'expenses': '30.00', 'total_amount': '500.00',
            'advance': '100.00', 'vendor_total_payment': '200.00', 'vendor_advance': '50.00',
            'payment_status': 'partial', 'vendor_payment_status': 'partial', 'invoice_no': '', 'gst_percent': '18.00',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        job = OutJob.objects.get(pk=created.data['id'])
        self.assertEqual(job.profit, Decimal('350.00'))
        self.assertEqual(job.balance, Decimal('400.00'))
        self.assertEqual(job.vendor_balance, Decimal('150.00'))
        self.assertEqual((job.contact_number, job.description, job.quantity, job.priority), ('9344078224', 'Print two-sided cards', 200, 'high'))
        self.assertEqual((str(job.delivery_date), job.delivery_lp_office, job.delivery_porter, job.delivery_courier), ('2026-10-28', True, False, True))
        self.assertEqual(job.remarks, 'Pack separately')
        self.assertIsNone(job.invoice_no)
        self.assertEqual((job.payment_status, job.vendor_payment_status, job.gst_percent), ('partial', 'partial', Decimal('18.00')))

    def test_job_assignment_options_and_staff_assignment(self):
        designer = get_user_model().objects.create_user(username='job-designer')
        department = Department.objects.create(name='Production')
        choices = self.client.get(reverse('libinjobs:injob-assignment-options'))
        self.assertEqual(choices.status_code, status.HTTP_200_OK)
        self.assertIn(designer.pk, [item['id'] for item in choices.data])

        created = self.client.post(
            reverse('libinjobs:injob-list'),
            {
                'customer_name': 'Assigned Customer', 'job_type': 'Flyer',
                'designer': designer.pk, 'assigned_users': [designer.pk],
                'assigned_departments': [department.pk],
            },
            format='json',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        job = InJob.objects.get(pk=created.data['id'])
        self.assertEqual(job.designer, designer)
        self.assertEqual(list(job.assigned_users.all()), [designer])
        self.assertEqual(list(job.assigned_departments.all()), [department])


class OperationsApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='operations-user', password='test-pass-123')
        grant_test_access(self.user)
        self.client.force_authenticate(self.user)
        self.stock = StockItem.objects.create(name='Premium Paper', current_stock=100, min_stock=10)
        self.machine = Machine.objects.create(code='PRESS-1', name='Digital Press')
        self.in_job = InJob.objects.create(
            customer_name='Operations Client', job_type='Flyer', quantity=100, created_by=self.user,
        )

    def test_stock_adjustment_is_atomic_and_creates_history(self):
        url = reverse('libinjobs:stockitem-adjust', args=(self.stock.pk,))
        response = self.client.post(
            url,
            {'movement_type': StockMovement.MovementType.OUT, 'quantity': '25.00', 'reason': 'Used for job', 'in_job': self.in_job.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.current_stock, 75)
        self.assertEqual(StockMovement.objects.get().balance_after, 75)

    def test_stock_cannot_become_negative(self):
        url = reverse('libinjobs:stockitem-adjust', args=(self.stock.pk,))
        response = self.client.post(
            url,
            {'movement_type': StockMovement.MovementType.OUT, 'quantity': '101.00', 'reason': 'Too much'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.current_stock, 100)
        self.assertFalse(StockMovement.objects.exists())

    def test_machine_breakdown_creates_status_history(self):
        url = reverse('libinjobs:machine-set-status', args=(self.machine.pk,))
        response = self.client.post(url, {'status': 'breakdown', 'reason': 'Paper jam'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.operational_status, Machine.OperationalStatus.BREAKDOWN)
        self.assertEqual(MachineStatusHistory.objects.get().reason, 'Paper jam')

    def test_machine_counter_rejects_reversed_counts(self):
        response = self.client.post(
            reverse('libinjobs:machinecounter-list'),
            {'machine': self.machine.pk, 'morning_count': 200, 'ending_count': 100},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(MachineCounter.objects.exists())

    def test_delivery_requires_exactly_one_job(self):
        response = self.client.post(
            reverse('libinjobs:delivery-list'),
            {'status': Delivery.Status.PENDING},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_wastage_record_is_linked_to_authenticated_user(self):
        response = self.client.post(
            reverse('libinjobs:wastagerecord-list'),
            {'wastage_type': 'paper', 'quantity': '5.00', 'in_job': self.in_job.pk, 'reason': 'Setup sheets'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(WastageRecord.objects.get().recorded_by, self.user)


class FinanceApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='finance-user', password='test-pass-123')
        grant_test_access(self.user)
        self.client.force_authenticate(self.user)
        self.net_bank = CashAccount.objects.create(name='Net Bank Cash', account_type='net_bank', balance=1000)
        self.petty = CashAccount.objects.create(name='Petty Cash', account_type='petty', balance=100)
        self.in_job = InJob.objects.create(
            customer_name='Finance Client', job_type='Brochure', quantity=100,
            total_amount=500, created_by=self.user,
        )
        self.out_job = OutJob.objects.create(
            customer_name='Vendor Client', vendor='Print Vendor', job_type='Banner',
            total_amount=800, vendor_total_payment=300, created_by=self.user,
        )

    def test_payment_job_options_include_both_routes_and_supplier_balance(self):
        customer = self.client.get(reverse('libinjobs:customerpayment-job-options'))
        self.assertEqual(customer.status_code, status.HTTP_200_OK, customer.data)
        self.assertEqual(
            {(job['kind'], job['id'], job['job_number'], job['balance']) for job in customer.data['jobs']},
            {('in', self.in_job.pk, self.in_job.job_number, Decimal('500.00')),
             ('out', self.out_job.pk, self.out_job.job_number, Decimal('800.00'))},
        )
        self.assertEqual(customer.data['cash_accounts'][0]['name'], 'Net Bank Cash')

        vendor = self.client.get(reverse('libinjobs:vendorpayment-job-options'))
        self.assertEqual(vendor.status_code, status.HTTP_200_OK, vendor.data)
        self.assertEqual(len(vendor.data['jobs']), 1)
        self.assertEqual(vendor.data['jobs'][0]['balance'], Decimal('300.00'))
        self.assertEqual(vendor.data['jobs'][0]['vendor'], 'Print Vendor')

    def test_payment_job_options_require_finance_permission(self):
        restricted = get_user_model().objects.create_user(username='no-finance-options')
        UserProfile.objects.create(user=restricted, role=Role.objects.create(
            name='No Finance', default_permissions={'finance': False},
        ))
        self.client.force_authenticate(restricted)
        for route in ('customerpayment-job-options', 'vendorpayment-job-options'):
            self.assertEqual(self.client.get(reverse(f'libinjobs:{route}')).status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_payment_updates_job_and_cash_atomically(self):
        response = self.client.post(
            reverse('libinjobs:customerpayment-list'),
            {
                'job_type': 'in', 'job_id': self.in_job.pk, 'amount': '200.00',
                'payment_type': 'advance', 'payment_date': str(timezone.localdate()),
                'method': 'UPI', 'cash_account': self.net_bank.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.in_job.refresh_from_db()
        self.net_bank.refresh_from_db()
        self.assertEqual(self.in_job.advance, 200)
        self.assertEqual(self.in_job.payment_status, 'partial')
        self.assertEqual(self.net_bank.balance, 1200)
        self.assertEqual(CashTransaction.objects.get().balance_after, 1200)

    def test_customer_overpayment_rolls_back(self):
        response = self.client.post(
            reverse('libinjobs:customerpayment-list'),
            {'job_type': 'in', 'job_id': self.in_job.pk, 'amount': '501.00', 'payment_date': str(timezone.localdate())},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CustomerPayment.objects.exists())
        self.in_job.refresh_from_db()
        self.assertEqual(self.in_job.advance, 0)

    def test_vendor_payment_debits_cash_and_updates_status(self):
        response = self.client.post(
            reverse('libinjobs:vendorpayment-list'),
            {
                'out_job': self.out_job.pk, 'amount': '100.00',
                'payment_date': str(timezone.localdate()), 'cash_account': self.net_bank.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['job_number'], self.out_job.job_number)
        self.out_job.refresh_from_db()
        self.net_bank.refresh_from_db()
        self.assertEqual(self.out_job.vendor_advance, 100)
        self.assertEqual(self.out_job.vendor_payment_status, 'partial')
        self.assertEqual(self.net_bank.balance, 900)
        self.assertEqual(VendorPayment.objects.count(), 1)

    def test_cash_transfer_posts_balanced_ledger_entries(self):
        response = self.client.post(
            reverse('libinjobs:cashtransfer-list'),
            {
                'source': self.net_bank.pk, 'destination': self.petty.pk,
                'amount': '250.00', 'transfer_date': str(timezone.localdate()),
                'reason': 'Petty cash top-up',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.net_bank.refresh_from_db()
        self.petty.refresh_from_db()
        self.assertEqual(self.net_bank.balance, 750)
        self.assertEqual(self.petty.balance, 350)
        self.assertEqual(CashTransaction.objects.count(), 2)
        self.assertEqual(CashTransfer.objects.count(), 1)

    def test_invoice_calculates_gst_and_total(self):
        response = self.client.post(
            reverse('libinjobs:invoice-list'),
            {
                'in_job': self.in_job.pk, 'invoice_no': 'INV-001',
                'invoice_date': str(timezone.localdate()), 'subtotal': '1000.00',
                'gst_percent': '18.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['gst_amount'], '180.00')
        self.assertEqual(response.data['grand_total'], '1180.00')
        self.assertEqual(Invoice.objects.count(), 1)


class AccessAndReportingApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='chunk-five-admin', password='test-pass-123')
        grant_test_access(self.user)
        self.client.force_authenticate(self.user)

    def test_user_creation_hashes_password_and_creates_profile(self):
        role = Role.objects.create(name='Designer', default_permissions={'pipeline': True})
        department = Department.objects.create(name='Design')
        response = self.client.post(
            reverse('libinjobs:useraccount-list'),
            {
                'username': 'new-designer', 'first_name': 'New', 'last_name': 'Designer',
                'password': 'safe-test-password', 'role': role.pk, 'department': department.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_user = get_user_model().objects.get(username='new-designer')
        self.assertTrue(created_user.check_password('safe-test-password'))
        self.assertEqual(created_user.libin_profile.role, role)
        self.assertEqual(created_user.libin_profile.department, department)
        self.assertEqual(response.data['role_name'], 'Designer')
        self.assertEqual(response.data['department_name'], 'Design')

    def test_user_creation_requires_password(self):
        response = self.client.post(reverse('libinjobs:useraccount-list'), {'username': 'missing-password'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_module_override_can_allow_a_role_denied_module(self):
        role = Role.objects.create(name='Restricted', default_permissions={'stock': False})
        UserProfile.objects.update_or_create(user=self.user, defaults={'role': role})
        self.user._state.fields_cache.pop('libin_profile', None)
        denied = self.client.get(reverse('libinjobs:stockitem-list'))
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        ModulePermissionOverride.objects.create(
            user=self.user, module='stock', access=ModulePermissionOverride.Access.ALLOW,
        )
        allowed = self.client.get(reverse('libinjobs:stockitem-list'))
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_role_defaults_control_visible_modules_and_auth_payload(self):
        employee = get_user_model().objects.create_user(username='limited-employee', password='test-pass-123')
        role = Role.objects.create(name='Sales only', default_permissions={'pipeline': True})
        UserProfile.objects.create(user=employee, role=role)
        self.client.force_authenticate(employee)

        self.assertEqual(self.client.get(reverse('libinjobs:pipelinejob-list')).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-list')).status_code, status.HTTP_403_FORBIDDEN)
        current = self.client.get(reverse('libinjobs:auth-me'))
        self.assertTrue(current.data['permissions']['pipeline'])
        self.assertFalse(current.data['permissions']['injobs'])

    def test_permission_manager_can_get_user_choices_without_user_admin_access(self):
        role = Role.objects.create(name='Permission manager', default_permissions={'permissions': True, 'injobs': True})
        UserProfile.objects.update_or_create(user=self.user, defaults={'role': role})
        self.user._state.fields_cache.pop('libin_profile', None)
        employee = get_user_model().objects.create_user(username='managed-employee')
        UserProfile.objects.create(user=employee, role=Role.objects.create(name='Production', default_permissions={'injobs': False}))

        choices = self.client.get(reverse('libinjobs:modulepermissionoverride-user-options'))
        self.assertEqual(choices.status_code, status.HTTP_200_OK)
        self.assertEqual(choices.data[0]['username'], self.user.username)
        self.assertEqual(self.client.get(reverse('libinjobs:useraccount-list')).status_code, status.HTTP_403_FORBIDDEN)

        created = self.client.post(
            reverse('libinjobs:modulepermissionoverride-list'),
            {'user': employee.pk, 'module': 'injobs', 'access': 'allow'},
            format='json',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertTrue(created.data['effective_access'])
        self.assertEqual(self.client.get(reverse('libinjobs:modulepermissionoverride-list'), {'user': employee.pk}).data[0]['access'], 'allow')

    def test_notifications_are_private_and_can_be_marked_read(self):
        other_user = get_user_model().objects.create_user(username='notification-other')
        own = Notification.objects.create(recipient=self.user, title='Your job', message='Ready')
        Notification.objects.create(recipient=other_user, title='Other job', message='Private')

        listed = self.client.get(reverse('libinjobs:notification-list'))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual([item['id'] for item in listed.data], [own.pk])

        marked = self.client.post(reverse('libinjobs:notification-mark-read', args=(own.pk,)))
        self.assertEqual(marked.status_code, status.HTTP_200_OK)
        self.assertTrue(marked.data['is_read'])

    def test_follow_up_records_creator(self):
        response = self.client.post(
            reverse('libinjobs:followup-list'),
            {'follow_up_date': str(timezone.localdate()), 'customer_name': 'Prospect', 'quantity': 500},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FollowUp.objects.get().created_by, self.user)

    def test_dashboard_and_daily_report_return_metrics(self):
        dashboard = self.client.get(reverse('libinjobs:dashboard-list'))
        report = self.client.get(reverse('libinjobs:report-daily'))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertIn('total_jobs', dashboard.data)
        self.assertIn('unread_notifications', dashboard.data)
        self.assertEqual(report.status_code, status.HTTP_200_OK)
        self.assertIn('revenue', report.data)


class JobBoardApiTests(APITestCase):
    def setUp(self):
        self.first = get_user_model().objects.create_user(username='first-worker')
        self.second = get_user_model().objects.create_user(username='second-worker')
        self.department = Department.objects.create(name='Production')
        self.other_department = Department.objects.create(name='Design')
        role = Role.objects.create(name='Job worker', default_permissions={'injobs': True, 'outjobs': True, 'jobboard': True})
        UserProfile.objects.create(user=self.first, role=role, department=self.department)
        UserProfile.objects.create(user=self.second, role=role, department=self.department)

    def test_superadmin_can_see_acceptance_counts_and_projects(self):
        accepted_at = timezone.now()
        InJob.objects.create(customer_name='Alpha', job_type='Cards', job_name='Alpha cards', created_by=self.first, accepted_by=self.first, accepted_at=accepted_at)
        OutJob.objects.create(customer_name='Beta', job_type='Signage', vendor='Printer', created_by=self.first, accepted_by=self.first, accepted_at=accepted_at)
        InJob.objects.create(customer_name='Gamma', job_type='Booklet', created_by=self.first, accepted_by=self.second, accepted_at=accepted_at)
        OutJob.objects.create(customer_name='Unclaimed', job_type='Banner', vendor='Printer', created_by=self.first)
        endpoint = reverse('libinjobs:job-board-accepted-summary')

        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.get(endpoint).status_code, status.HTTP_403_FORBIDDEN)

        admin = get_user_model().objects.create_superuser(username='board-admin', password='test-pass-123')
        self.client.force_authenticate(admin)
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['totals'], {'employees': 2, 'accepted_jobs': 3, 'in_jobs': 2, 'out_jobs': 1})
        self.assertEqual(response.data['employees'][0]['username'], self.first.username)
        self.assertEqual(response.data['employees'][0]['accepted_count'], 2)
        self.assertEqual({project['project_name'] for project in response.data['employees'][0]['projects']}, {'Alpha cards', 'Signage'})
        self.assertNotIn('Unclaimed', str(response.data))

    def test_superadmin_can_list_view_and_edit_all_jobs_without_claiming(self):
        pending_in = InJob.objects.create(customer_name='New customer', job_type='Cards', created_by=self.first)
        claimed_in = InJob.objects.create(customer_name='Assigned customer', job_type='Books', created_by=self.first, accepted_by=self.second, accepted_at=timezone.now())
        pending_in.assigned_users.add(self.second)
        pending_out = OutJob.objects.create(customer_name='New buyer', vendor='External supplier', job_type='Banner', created_by=self.first)
        claimed_out = OutJob.objects.create(customer_name='Assigned buyer', vendor='External supplier', job_type='Signage', created_by=self.first, accepted_by=self.second, accepted_at=timezone.now())
        admin = get_user_model().objects.create_superuser(username='all-jobs-admin', password='test-pass-123')
        self.client.force_authenticate(admin)

        in_list = self.client.get(reverse('libinjobs:injob-list'))
        out_list = self.client.get(reverse('libinjobs:outjob-list'))
        self.assertCountEqual([item['id'] for item in in_list.data], [pending_in.pk, claimed_in.pk])
        self.assertCountEqual([item['id'] for item in out_list.data], [pending_out.pk, claimed_out.pk])
        self.assertEqual(in_list.data[0]['created_by_display'], self.first.username)
        self.assertEqual(next(item for item in in_list.data if item['id'] == claimed_in.pk)['accepted_by_display'], self.second.username)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-detail', args=(pending_in.pk,))).data['customer_name'], 'New customer')
        self.assertEqual(self.client.get(reverse('libinjobs:outjob-detail', args=(claimed_out.pk,))).data['vendor'], 'External supplier')
        self.assertEqual(self.client.patch(reverse('libinjobs:outjob-detail', args=(pending_out.pk,)), {'remarks': 'Admin reviewed'}, format='json').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(reverse('libinjobs:report-out-jobs')).status_code, status.HTTP_200_OK)
        self.assertCountEqual([item['id'] for item in self.client.get(reverse('libinjobs:report-pending')).data['in_jobs']], [pending_in.pk, claimed_in.pk])
        self.assertEqual(self.client.get(reverse('libinjobs:injob-my-jobs')).data, [])

        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-list')).data, [])
        self.assertEqual(self.client.get(reverse('libinjobs:outjob-list')).data, [])
        self.assertEqual(self.client.get(reverse('libinjobs:injob-detail', args=(pending_in.pk,))).status_code, status.HTTP_404_NOT_FOUND)

    def test_offer_is_shared_but_only_first_acceptance_and_owner_start_succeed(self):
        job = InJob.objects.create(customer_name='Client', job_type='Cards', created_by=self.first)
        available = reverse('libinjobs:injob-available')
        accept = reverse('libinjobs:injob-accept', args=(job.pk,))
        start = reverse('libinjobs:injob-start', args=(job.pk,))
        for user in (self.first, self.second):
            self.client.force_authenticate(user)
            self.assertEqual([item['id'] for item in self.client.get(available).data], [job.pk])
        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.post(accept).status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.second)
        self.assertEqual(self.client.post(accept).status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self.client.post(start).status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self.client.get(available).data, [])
        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.post(start).status_code, status.HTTP_200_OK)
        job.refresh_from_db()
        self.assertEqual(job.accepted_by, self.first)
        self.assertTrue(job.assigned_users.filter(pk=self.first.pk).exists())
        self.assertIsNotNone(job.work_started_at)
        self.assertEqual(job.printing_status, InJob.ProductionStatus.IN_PROGRESS)
        self.assertEqual(self.client.post(start).status_code, status.HTTP_409_CONFLICT)

    def test_staff_can_create_unassigned_out_job_and_it_is_an_open_offer(self):
        self.client.force_authenticate(self.first)
        response = self.client.post(reverse('libinjobs:outjob-list'), {
            'customer_name': 'Walk-in client', 'contact_number': '', 'vendor': 'Print supplier',
            'job_type': 'Banner', 'supplier_expenses': 0, 'priority': 'normal',
            'description': '', 'quantity': 1, 'delivery_lp_office': False,
            'delivery_porter': False, 'delivery_courier': False, 'remarks': '',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        job = OutJob.objects.get(pk=response.data['id'])
        self.assertEqual(job.created_by, self.first)
        self.assertFalse(job.assigned_users.exists())
        self.assertFalse(job.assigned_departments.exists())
        self.assertIsNone(job.accepted_by)
        self.assertIsNone(job.contact_number)
        self.assertIsNone(job.description)
        self.assertIsNone(job.remarks)
        self.assertEqual(self.client.get(reverse('libinjobs:outjob-list')).data, [])
        self.assertIn(job.pk, [item['id'] for item in self.client.get(reverse('libinjobs:outjob-available')).data])
        self.assertEqual(self.client.post(reverse('libinjobs:outjob-accept', args=(job.pk,))).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(reverse('libinjobs:outjob-start', args=(job.pk,))).status_code, status.HTTP_200_OK)
        completed = self.client.patch(reverse('libinjobs:outjob-detail', args=(job.pk,)), {'status': 'completed'}, format='json')
        self.assertEqual(completed.status_code, status.HTTP_200_OK, completed.data)
        self.assertEqual(Delivery.objects.get(out_job=job).contact_number, '')

    def test_department_and_module_access_filter_offers(self):
        job = InJob.objects.create(customer_name='Client', job_type='Cards', created_by=self.first)
        job.assigned_departments.add(self.other_department)
        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-available')).data, [])
        self.assertEqual(self.client.post(reverse('libinjobs:injob-accept', args=(job.pk,))).status_code, status.HTTP_409_CONFLICT)
        self.first.libin_profile.department = self.other_department
        self.first.libin_profile.save()
        self.assertEqual(len(self.client.get(reverse('libinjobs:injob-available')).data), 1)
        ModulePermissionOverride.objects.create(user=self.first, module='injobs', access=ModulePermissionOverride.Access.DENY)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-available')).status_code, status.HTTP_403_FORBIDDEN)

    def test_job_board_permission_is_separate_from_job_crud_access(self):
        self.client.force_authenticate(self.first)
        ModulePermissionOverride.objects.create(user=self.first, module='jobboard', access=ModulePermissionOverride.Access.DENY)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-list')).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-available')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('libinjobs:outjob-my-jobs')).status_code, status.HTTP_403_FORBIDDEN)
        current = self.client.get(reverse('libinjobs:auth-me'))
        self.assertFalse(current.data['permissions']['jobboard'])

    def test_out_job_claim_and_status_cannot_be_bypassed(self):
        job = OutJob.objects.create(customer_name='Client', job_type='Binding', vendor='Vendor', created_by=self.first)
        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.post(reverse('libinjobs:outjob-accept', args=(job.pk,))).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(reverse('libinjobs:outjob-detail', args=(job.pk,)), {'status': 'in_progress'}, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(reverse('libinjobs:outjob-start', args=(job.pk,))).status_code, status.HTTP_200_OK)
        job.refresh_from_db()
        self.assertEqual(job.status, OutJob.Status.IN_PROGRESS)

    def test_one_job_can_be_assigned_to_multiple_staff_members(self):
        self.client.force_authenticate(self.first)
        created = self.client.post(reverse('libinjobs:injob-list'), {
            'customer_name': 'Team client', 'job_type': 'Booklets',
            'assigned_users': [self.first.pk, self.second.pk],
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('customer_name', created.data)
        job = InJob.objects.get(pk=created.data['id'])
        self.assertCountEqual(job.assigned_users.values_list('pk', flat=True), [self.first.pk, self.second.pk])
        self.client.force_authenticate(self.second)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-my-jobs')).data, [])
        self.client.force_authenticate(self.first)
        accepted = self.client.post(reverse('libinjobs:injob-accept', args=(job.pk,)))
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        self.assertCountEqual(accepted.data['assigned_users'], [self.first.pk, self.second.pk])

        changed = self.client.patch(reverse('libinjobs:injob-detail', args=(job.pk,)), {
            'assigned_users': [self.second.pk],
        }, format='json')
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.assertEqual(changed.data['assigned_users'], [self.second.pk])

        outsourced = self.client.post(reverse('libinjobs:outjob-list'), {
            'customer_name': 'Team client', 'job_type': 'Binding', 'vendor': 'Vendor',
            'assigned_users': [self.first.pk, self.second.pk],
        }, format='json')
        self.assertEqual(outsourced.status_code, status.HTTP_201_CREATED)
        self.assertCountEqual(OutJob.objects.get(pk=outsourced.data['id']).assigned_users.values_list('pk', flat=True), [self.first.pk, self.second.pk])

    def test_only_claimant_gets_full_details_and_others_lose_job(self):
        job = InJob.objects.create(customer_name='Private Customer', contact_number='1234567890', job_type='Cards', remarks='Secret instructions', created_by=self.first)
        detail = reverse('libinjobs:injob-detail', args=(job.pk,))
        self.client.force_authenticate(self.second)
        preview = self.client.get(reverse('libinjobs:injob-available')).data[0]
        self.assertNotIn('customer_name', preview)
        self.assertNotIn('remarks', preview)
        self.assertEqual(self.client.get(detail).status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.first)
        accepted = self.client.post(reverse('libinjobs:injob-accept', args=(job.pk,)))
        self.assertEqual(accepted.data['customer_name'], 'Private Customer')
        self.assertEqual(self.client.get(detail).data['remarks'], 'Secret instructions')
        self.client.force_authenticate(self.second)
        self.assertEqual(self.client.get(reverse('libinjobs:injob-available')).data, [])
        self.assertEqual(self.client.get(reverse('libinjobs:injob-my-jobs')).data, [])
        self.assertEqual(self.client.get(reverse('libinjobs:injob-list')).data, [])
        self.assertEqual(self.client.get(detail).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.patch(detail, {'remarks': 'Changed'}, format='json').status_code, status.HTTP_404_NOT_FOUND)
        ModulePermissionOverride.objects.create(user=self.second, module='reports', access=ModulePermissionOverride.Access.ALLOW)
        self.assertEqual(self.client.get(reverse('libinjobs:report-pending')).data['in_jobs'], [])

    def test_out_job_details_are_private_after_claim(self):
        job = OutJob.objects.create(customer_name='Private buyer', vendor='Private vendor', job_type='Binding', created_by=self.first)
        detail = reverse('libinjobs:outjob-detail', args=(job.pk,))
        self.client.force_authenticate(self.second)
        self.assertNotIn('vendor', self.client.get(reverse('libinjobs:outjob-available')).data[0])
        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.post(reverse('libinjobs:outjob-accept', args=(job.pk,))).data['vendor'], 'Private vendor')
        self.client.force_authenticate(self.second)
        self.assertEqual(self.client.get(reverse('libinjobs:outjob-available')).data, [])
        self.assertEqual(self.client.get(reverse('libinjobs:outjob-list')).data, [])
        self.assertEqual(self.client.get(detail).status_code, status.HTTP_404_NOT_FOUND)
        ModulePermissionOverride.objects.create(user=self.second, module='reports', access=ModulePermissionOverride.Access.ALLOW)
        self.assertEqual(self.client.get(reverse('libinjobs:report-out-jobs')).data, [])


class ProductionDeliveryWorkflowTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='production-delivery-user')
        grant_test_access(self.user)
        self.client.force_authenticate(self.user)

    def make_pipeline(self):
        return PipelineJob.objects.create(
            client_name='Delivery Customer', contact_number='9876543210',
            job_type='Brochure', quantity=100, created_by=self.user,
        )

    def test_accepted_in_job_can_be_cancelled_and_removed_from_offers(self):
        pipeline = self.make_pipeline()
        converted = self.client.post(reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,)))
        self.assertEqual(converted.status_code, status.HTTP_201_CREATED)
        job = InJob.objects.get(pipeline_job=pipeline)
        self.assertEqual(self.client.post(reverse('libinjobs:injob-accept', args=(job.pk,))).status_code, status.HTTP_200_OK)

        cancelled = self.client.post(reverse('libinjobs:injob-cancel', args=(job.pk,)))
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK, cancelled.data)
        self.assertEqual(cancelled.data['printing_status'], InJob.ProductionStatus.CANCELLED)
        self.assertNotIn(job.pk, [item['id'] for item in self.client.get(reverse('libinjobs:injob-available')).data])

    def test_completed_in_job_cannot_be_cancelled(self):
        pipeline = self.make_pipeline()
        converted = self.client.post(reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,)))
        self.assertEqual(converted.status_code, status.HTTP_201_CREATED)
        job = InJob.objects.get(pipeline_job=pipeline)
        self.assertEqual(self.client.post(reverse('libinjobs:injob-accept', args=(job.pk,))).status_code, status.HTTP_200_OK)
        job.printing_status = InJob.ProductionStatus.COMPLETED
        job.save(update_fields=('printing_status', 'updated_at'))
        response = self.client.post(reverse('libinjobs:injob-cancel', args=(job.pk,)))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_in_job_moves_to_delivery_only_after_printing_and_finishing_complete(self):
        pipeline = self.make_pipeline()
        converted = self.client.post(reverse('libinjobs:pipelinejob-convert-to-in-job', args=(pipeline.pk,)))
        self.assertEqual(converted.status_code, status.HTTP_201_CREATED)
        job = InJob.objects.get(pipeline_job=pipeline)
        detail = reverse('libinjobs:injob-detail', args=(job.pk,))
        self.assertEqual(self.client.patch(detail, {'finishing_status': 'completed'}, format='json').status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post(reverse('libinjobs:injob-accept', args=(job.pk,))).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(detail, {'printing_status': 'completed'}, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(reverse('libinjobs:injob-start', args=(job.pk,))).status_code, status.HTTP_200_OK)
        printed = self.client.patch(detail, {'printing_status': 'completed'}, format='json')
        self.assertEqual(printed.status_code, status.HTTP_200_OK)
        self.assertFalse(Delivery.objects.filter(in_job=job).exists())

        finished = self.client.patch(detail, {'finishing_status': 'completed'}, format='json')
        self.assertEqual(finished.status_code, status.HTTP_200_OK)
        self.assertEqual(finished.data['delivery_status'], Delivery.Status.READY)
        delivery = Delivery.objects.get(in_job=job)
        self.assertEqual(delivery.contact_number, pipeline.contact_number)
        self.assertEqual(delivery.contact_person, pipeline.client_name)
        self.assertEqual(delivery.created_by, self.user)
        self.assertEqual(self.client.get(reverse('libinjobs:delivery-list'), {'status': 'ready'}).data[0]['in_job'], job.pk)
        self.assertEqual(self.client.patch(detail, {'remarks': 'Checked'}, format='json').status_code, status.HTTP_200_OK)
        self.assertEqual(Delivery.objects.filter(in_job=job).count(), 1)
        self.assertEqual(self.client.patch(detail, {'finishing_status': 'pending'}, format='json').status_code, status.HTTP_400_BAD_REQUEST)

    def test_out_job_completion_promotes_existing_delivery_once(self):
        pipeline = self.make_pipeline()
        converted = self.client.post(reverse('libinjobs:pipelinejob-convert-to-out-job', args=(pipeline.pk,)), {
            'vendor': 'Print Vendor', 'delivery_date': '2026-10-20',
        }, format='json')
        self.assertEqual(converted.status_code, status.HTTP_201_CREATED)
        job = OutJob.objects.get(pipeline_job=pipeline)
        detail = reverse('libinjobs:outjob-detail', args=(job.pk,))
        self.assertEqual(self.client.post(reverse('libinjobs:outjob-accept', args=(job.pk,))).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(detail, {'status': 'completed'}, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(reverse('libinjobs:outjob-start', args=(job.pk,))).status_code, status.HTTP_200_OK)
        existing = Delivery.objects.create(out_job=job, status=Delivery.Status.PENDING, created_by=self.user)
        completed = self.client.patch(detail, {'status': 'completed'}, format='json')
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        self.assertEqual(completed.data['delivery_status'], Delivery.Status.READY)
        existing.refresh_from_db()
        self.assertEqual(existing.status, Delivery.Status.READY)
        self.assertEqual(Delivery.objects.filter(out_job=job).count(), 1)
        self.assertEqual(self.client.patch(detail, {'status': 'pending'}, format='json').status_code, status.HTTP_400_BAD_REQUEST)

    def test_out_job_completion_creates_ready_delivery(self):
        pipeline = self.make_pipeline()
        self.client.post(reverse('libinjobs:pipelinejob-convert-to-out-job', args=(pipeline.pk,)), {
            'vendor': 'Print Vendor', 'delivery_date': '2026-10-20',
        }, format='json')
        job = OutJob.objects.get(pipeline_job=pipeline)
        self.client.post(reverse('libinjobs:outjob-accept', args=(job.pk,)))
        self.client.post(reverse('libinjobs:outjob-start', args=(job.pk,)))
        completed = self.client.patch(reverse('libinjobs:outjob-detail', args=(job.pk,)), {'status': 'completed'}, format='json')
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        delivery = Delivery.objects.get(out_job=job)
        self.assertEqual(delivery.status, Delivery.Status.READY)
        self.assertEqual(str(delivery.delivery_date), '2026-10-20')


class AuthenticationApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='login-user', password='correct-password', first_name='Login',
        )

    def test_login_returns_token_user_and_permissions(self):
        response = self.client.post(
            reverse('libinjobs:auth-login'),
            {'username': 'login-user', 'password': 'correct-password'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['token'])
        self.assertEqual(response.data['user']['username'], 'login-user')
        self.assertIn('dashboard', response.data['permissions'])

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        current_user = self.client.get(reverse('libinjobs:auth-me'))
        self.assertEqual(current_user.status_code, status.HTTP_200_OK)
        self.assertEqual(current_user.data['user']['id'], self.user.pk)

    def test_invalid_credentials_are_rejected(self):
        response = self.client.post(
            reverse('libinjobs:auth-login'),
            {'username': 'login-user', 'password': 'wrong-password'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('token', response.data)

    def test_logout_revokes_token(self):
        login = self.client.post(
            reverse('libinjobs:auth-login'),
            {'username': 'login-user', 'password': 'correct-password'},
            format='json',
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {login.data['token']}")
        logout = self.client.post(reverse('libinjobs:auth-logout'))
        self.assertEqual(self.client.get(reverse('libinjobs:auth-me')).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_comprehensive_reports_endpoint(self):
        superuser = get_user_model().objects.create_superuser(username='report-admin', password='password123')
        self.client.force_authenticate(superuser)
        res = self.client.get('/api/reports/comprehensive/?from=2026-11-01&to=2026-11-05')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('kpis', res.data)
        self.assertIn('in_jobs', res.data)
        self.assertIn('out_jobs', res.data)
        self.assertIn('customer_payments', res.data)
        self.assertIn('vendor_payments', res.data)
        self.assertIn('customers', res.data)
        self.assertIn('deliveries', res.data)
        self.assertIn('stock_items', res.data)
        self.assertIn('wastage_records', res.data)
        self.assertIn('machine_counters', res.data)
        self.assertIn('cash_accounts', res.data)

