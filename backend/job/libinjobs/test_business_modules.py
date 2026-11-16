from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import CashAccount, CashTransaction, FinanceEntry, FollowUp, InJob, OutJob, PipelineJob, Quotation, Role, Supplier, UserProfile


class BusinessModuleTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='module-admin', password='test-password')
        self.client.force_authenticate(self.admin)
        self.account = CashAccount.objects.create(name='Office cash', account_type='petty', balance=100)
        self.url = reverse('libinjobs:financeentry-list')

    def payload(self, **changes):
        return dict({'entry_type': 'expense', 'amount': '25.50', 'entry_date': '2026-10-18',
                     'account': self.account.pk, 'description': 'Office supplies', 'request_key': str(uuid4())}, **changes)

    def test_credit_debit_and_expense_post_to_cash_once(self):
        for kind, amount in [('credit', '50.00'), ('debit', '10.00'), ('expense', '25.50')]:
            payload = self.payload(entry_type=kind, amount=amount)
            response = self.client.post(self.url, payload, format='json')
            self.assertEqual(response.status_code, 201, response.data)
            duplicate = self.client.post(self.url, payload, format='json')
            self.assertEqual(duplicate.status_code, 200, duplicate.data)
            self.assertEqual(response.data['id'], duplicate.data['id'])
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('114.50'))
        self.assertEqual(CashTransaction.objects.count(), 3)
        self.assertEqual(FinanceEntry.objects.count(), 3)

    def test_failed_entries_leave_no_cash_or_ledger_changes(self):
        for changes in ({'amount': '101'}, {'amount': '0'}, {'entry_type': 'invalid'}):
            response = self.client.post(self.url, self.payload(**changes), format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, 100)
        self.assertFalse(FinanceEntry.objects.exists())
        self.assertFalse(CashTransaction.objects.exists())

    def test_idempotency_conflict_and_immutable_entries(self):
        payload = self.payload()
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        payload['amount'] = '1'
        self.assertEqual(self.client.post(self.url, payload, format='json').status_code, 400)
        url = reverse('libinjobs:financeentry-detail', args=(response.data['id'],))
        self.assertEqual(self.client.patch(url, {'amount': '1'}).status_code, 405)
        self.assertEqual(self.client.delete(url).status_code, 405)

    def test_inactive_account_and_supplier_rejected(self):
        supplier = Supplier.objects.create(name='Inactive', is_active=False)
        self.assertEqual(self.client.post(self.url, self.payload(supplier=supplier.pk), format='json').status_code, 400)
        self.account.is_active = False
        self.account.save()
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 400)

    def test_enquiries_preserve_followup_records(self):
        old = FollowUp.objects.create(customer_name='Existing lead', created_by=self.admin)
        url = reverse('libinjobs:enquiry-list')
        self.assertEqual(self.client.get(url).data[0]['id'], old.pk)
        response = self.client.post(url, {'customer_name': 'New lead', 'contact_number': '12345'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(FollowUp.objects.count(), 2)

    def test_enquiry_crud_and_conversion_links(self):
        url = reverse('libinjobs:enquiry-list')
        created = self.client.post(url, {
            'customer_name': 'Enquiry customer', 'contact_number': '9000000000',
            'job_type': 'Business cards', 'quantity': 100, 'quote': 'Double-sided print',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        enquiry_id = created.data['id']
        detail_url = reverse('libinjobs:enquiry-detail', args=(enquiry_id,))
        edited = self.client.patch(detail_url, {'remarks': 'Call after approval'}, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['remarks'], 'Call after approval')

        pipeline = self.client.post(reverse('libinjobs:pipelinejob-list'), {
            'source_enquiry': enquiry_id, 'client_name': 'Enquiry customer',
            'contact_number': '9000000000', 'job_type': 'Business cards', 'quantity': 100,
        }, format='json')
        self.assertEqual(pipeline.status_code, 201, pipeline.data)
        quotation = self.client.post(reverse('libinjobs:quotation-list'), {
            'source_enquiry': enquiry_id, 'customer_name': 'Enquiry customer',
            'quotation_date': '2026-10-22',
            'items': [{'description': 'Business cards', 'quantity': '100', 'unit_price': '1'}],
        }, format='json')
        self.assertEqual(quotation.status_code, 201, quotation.data)
        related = self.client.get(detail_url)
        self.assertEqual(related.data['converted_pipeline_jobs'][0]['id'], pipeline.data['id'])
        self.assertEqual(related.data['converted_quotations'][0]['id'], quotation.data['id'])

        self.assertEqual(self.client.delete(detail_url).status_code, 204)
        self.assertIsNone(PipelineJob.objects.get(pk=pipeline.data['id']).source_enquiry_id)
        self.assertIsNone(Quotation.objects.get(pk=quotation.data['id']).source_enquiry_id)

    def test_supplier_master_and_out_job_connection(self):
        response = self.client.post(reverse('libinjobs:supplier-list'), {'name': 'Print supplier', 'mobile': None}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        supplier_id = response.data['id']
        job = self.client.post(reverse('libinjobs:outjob-list'), {
            'customer_name': 'Customer', 'job_type': 'Print', 'vendor': 'Old label', 'supplier': supplier_id,
        }, format='json')
        self.assertEqual(job.status_code, 201, job.data)
        self.assertEqual(OutJob.objects.get(pk=job.data['id']).supplier_id, supplier_id)
        self.assertEqual(OutJob.objects.get(pk=job.data['id']).vendor, 'Print supplier')
        options = self.client.get(reverse('libinjobs:outjob-create-options'))
        self.assertEqual(options.data['suppliers'][0]['id'], supplier_id)

    def test_out_job_creation_with_vendor_payment_fields(self):
        job = self.client.post(reverse('libinjobs:outjob-list'), {
            'customer_name': 'Test Customer',
            'job_type': 'Signage Board',
            'vendor': 'Supplier XYZ',
            'quantity': 2,
            'total_amount': '1500.00',
            'advance': '500.00',
            'customer_payment_method': 'UPI',
            'vendor_total_payment': '1000.00',
            'vendor_advance': '300.00',
            'vendor_payment_method': 'Petty Cash',
        }, format='json')
        self.assertEqual(job.status_code, 201, job.data)
        out_job = OutJob.objects.get(pk=job.data['id'])
        self.assertEqual(out_job.vendor, 'Supplier XYZ')
        self.assertEqual(out_job.total_amount, Decimal('1500.00'))
        self.assertEqual(out_job.advance, Decimal('500.00'))
        self.assertEqual(out_job.vendor_total_payment, Decimal('1000.00'))
        self.assertEqual(out_job.vendor_advance, Decimal('300.00'))

        # Also test patch/update
        update = self.client.patch(reverse('libinjobs:outjob-detail', args=(out_job.pk,)), {
            'remarks': 'Updated remarks',
            'vendor_payment_method': 'Petty Cash',
        }, format='json')
        self.assertEqual(update.status_code, 200, update.data)

    def test_permissions_and_finance_lookup_do_not_require_cash_admin(self):
        staff = get_user_model().objects.create_user(username='finance-staff')
        role = Role.objects.create(name='Finance only', default_permissions={'finance': True})
        UserProfile.objects.create(user=staff, role=role)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(reverse('libinjobs:financeentry-accounts')).status_code, 200)
        self.assertEqual(self.client.get(reverse('libinjobs:supplier-list')).status_code, 403)
        self.assertEqual(self.client.get(reverse('libinjobs:enquiry-list')).status_code, 403)
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 201)
        role.default_permissions = {}
        role.save()
        self.client.force_authenticate(get_user_model().objects.get(pk=staff.pk))
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_user_creation_with_show_payment_details_toggle(self):
        role = Role.objects.create(name='Operator Role', default_permissions={'injobs': True, 'dashboard': True})
        # Admin creates user with show_payment_details=False
        create_resp = self.client.post(reverse('libinjobs:useraccount-list'), {
            'username': 'operator1',
            'password': 'password123',
            'first_name': 'Press',
            'last_name': 'Operator',
            'role': role.pk,
            'show_payment_details': False,
        }, format='json')
        self.assertEqual(create_resp.status_code, 201, create_resp.data)
        self.assertFalse(create_resp.data['show_payment_details'])

        user = get_user_model().objects.get(username='operator1')
        self.assertFalse(user.libin_profile.show_payment_details)

        # When operator logs in / fetches me, show_payment_details is False
        self.client.force_authenticate(user)
        me_resp = self.client.get(reverse('libinjobs:auth-me'))
        self.assertEqual(me_resp.status_code, 200)
        self.assertFalse(me_resp.data['user']['show_payment_details'])
        self.assertFalse(me_resp.data['permissions']['finance'])

        # In-Job financial fields are masked for this operator
        in_job = InJob.objects.create(
            job_name='Confidential Print',
            customer_name='VIP Client',
            total_amount=Decimal('5000.00'),
            advance=Decimal('2000.00'),
            accepted_by=user,
            created_by=self.admin,
        )
        in_job_resp = self.client.get(reverse('libinjobs:injob-detail', kwargs={'pk': in_job.pk}))
        self.assertEqual(in_job_resp.status_code, 200)
        self.assertIsNone(in_job_resp.data.get('total_amount'))
        self.assertIsNone(in_job_resp.data.get('advance'))
        self.assertIsNone(in_job_resp.data.get('balance'))

        # Dashboard has_finance_access is False
        dash_resp = self.client.get(reverse('libinjobs:dashboard-list'))
        self.assertEqual(dash_resp.status_code, 200)
        self.assertFalse(dash_resp.data['has_finance_access'])

        # Updating user to show_payment_details=True
        self.client.force_authenticate(self.admin)
        update_resp = self.client.patch(
            reverse('libinjobs:useraccount-detail', kwargs={'pk': user.pk}),
            {'show_payment_details': True},
            format='json'
        )
        self.assertEqual(update_resp.status_code, 200)
        self.assertTrue(update_resp.data['show_payment_details'])
        user.libin_profile.refresh_from_db()
        self.assertTrue(user.libin_profile.show_payment_details)

        # In-Job financial fields are now visible to operator
        self.client.force_authenticate(user)
        in_job_resp2 = self.client.get(reverse('libinjobs:injob-detail', kwargs={'pk': in_job.pk}))
        self.assertEqual(in_job_resp2.status_code, 200)
        self.assertEqual(Decimal(str(in_job_resp2.data['total_amount'])), Decimal('5000.00'))
        self.assertEqual(Decimal(str(in_job_resp2.data['advance'])), Decimal('2000.00'))

