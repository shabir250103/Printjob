from decimal import Decimal

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import CustomerPayment, InJob, JobDocument, ModulePermissionOverride, OutJob, Role, UserProfile, VendorPayment
from .permissions import user_has_module_access


class AccessHardeningTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='security-admin', password='original-password')
        self.manager = get_user_model().objects.create_user(username='delegated-manager')
        self.role = Role.objects.create(name='Delegated users', default_permissions={'users': True, 'permissions': True})
        UserProfile.objects.create(user=self.manager, role=self.role)
        UserProfile.objects.create(user=self.admin, role=self.role)
        self.client.force_authenticate(self.manager)

    def test_delegated_manager_cannot_change_or_delete_privileged_account(self):
        url = reverse('libinjobs:useraccount-detail', args=(self.admin.pk,))
        self.assertEqual(self.client.patch(url, {'password': 'replacement-password'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(url, {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password('original-password'))
        self.assertTrue(self.admin.is_active)

    def test_privileged_profile_role_and_override_are_protected(self):
        profile = reverse('libinjobs:userprofile-detail', args=(self.admin.libin_profile.pk,))
        self.assertEqual(self.client.patch(profile, {'is_active': False}, format='json').status_code, 403)
        role = reverse('libinjobs:role-detail', args=(self.role.pk,))
        self.assertEqual(self.client.patch(role, {'name': 'Changed'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(reverse('libinjobs:modulepermissionoverride-list'), {
            'user': self.admin.pk, 'module': 'finance', 'access': 'deny',
        }, format='json').status_code, 403)

    def test_cannot_grant_or_assume_permissions_beyond_own(self):
        broader = Role.objects.create(name='Finance', default_permissions={'finance': True})
        self.assertEqual(self.client.patch(reverse('libinjobs:useraccount-detail', args=(self.manager.pk,)), {
            'role': broader.pk,
        }, format='json').status_code, 403)
        self.assertEqual(self.client.post(reverse('libinjobs:role-list'), {
            'name': 'Unauthorized role', 'default_permissions': {'finance': True},
        }, format='json').status_code, 403)
        self.assertEqual(self.client.post(reverse('libinjobs:modulepermissionoverride-list'), {
            'user': self.manager.pk, 'module': 'finance', 'access': 'allow',
        }, format='json').status_code, 403)

    def test_regular_accounts_can_still_be_managed_within_scope(self):
        result = self.client.post(reverse('libinjobs:useraccount-list'), {
            'username': 'ordinary-worker', 'password': 'test-password',
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        user = get_user_model().objects.get(pk=result.data['id'])
        self.assertFalse(user_has_module_access(user, 'finance'))

    def test_no_profile_no_role_and_inactive_role_deny_access(self):
        user = get_user_model().objects.create_user(username='unconfigured')
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(reverse('libinjobs:stockitem-list')).status_code, 403)
        UserProfile.objects.create(user=user)
        self.assertEqual(self.client.get(reverse('libinjobs:stockitem-list')).status_code, 403)
        override = ModulePermissionOverride.objects.create(user=user, module='stock', access='allow')
        self.assertTrue(override.effective_access)
        self.assertEqual(self.client.get(reverse('libinjobs:stockitem-list')).status_code, 200)
        role = Role.objects.create(name='Inactive', default_permissions={'stock': True}, is_active=False)
        profile = user.libin_profile
        profile.role = role
        profile.save()
        self.assertFalse(override.effective_access)
        self.assertEqual(self.client.get(reverse('libinjobs:stockitem-list')).status_code, 403)

    def test_superadmin_reset_revokes_existing_token(self):
        token = Token.objects.create(user=self.admin)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(reverse('libinjobs:useraccount-detail', args=(self.admin.pk,)), {
            'password': 'new-test-password',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Token.objects.filter(pk=token.pk).exists())

    def test_role_values_require_booleans(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse('libinjobs:role-list'), {
            'name': 'Malformed', 'default_permissions': {'finance': 'false'},
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_dormant_grants_cannot_be_activated_by_a_less_privileged_manager(self):
        user = get_user_model().objects.create_user(username='inactive-finance', is_active=False)
        UserProfile.objects.create(user=user)
        ModulePermissionOverride.objects.create(user=user, module='finance', access='allow')
        response = self.client.patch(reverse('libinjobs:useraccount-detail', args=(user.pk,)), {'is_active': True}, format='json')
        self.assertEqual(response.status_code, 403)
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_override_identity_cannot_be_changed(self):
        self.client.force_authenticate(self.admin)
        override = ModulePermissionOverride.objects.create(user=self.manager, module='finance', access='deny')
        response = self.client.patch(reverse('libinjobs:modulepermissionoverride-detail', args=(override.pk,)), {'module': 'stock'}, format='json')
        self.assertEqual(response.status_code, 400)
        override.refresh_from_db()
        self.assertEqual(override.module, 'finance')

    def test_claimant_documents_are_hidden_after_module_access_is_removed(self):
        job = InJob.objects.create(customer_name='Synthetic', job_type='Cards', created_by=self.manager, accepted_by=self.manager)
        JobDocument.objects.create(in_job=job, kind='reference', file='synthetic-reference.pdf', uploaded_by=self.manager)
        self.assertEqual(self.client.get(reverse('libinjobs:jobdocument-list')).data, [])
        grant = ModulePermissionOverride.objects.create(user=self.manager, module='injobs', access='allow')
        self.assertEqual(len(self.client.get(reverse('libinjobs:jobdocument-list')).data), 1)
        grant.access = 'deny'
        grant.save()
        self.assertEqual(self.client.get(reverse('libinjobs:jobdocument-list')).data, [])


class PaymentIntegrityTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='money-admin', password='test-password')
        self.client.force_authenticate(self.admin)

    def create_job(self, kind):
        data = {'customer_name': 'Synthetic customer', 'job_type': 'Cards', 'total_amount': '100.00', 'advance': '30.00'}
        if kind == 'out':
            data.update(vendor='Synthetic supplier', vendor_total_payment='80.00', vendor_advance='20.00')
        result = self.client.post(reverse(f'libinjobs:{kind}job-list'), data, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        return (InJob if kind == 'in' else OutJob).objects.get(pk=result.data['id'])

    def test_opening_advances_create_payment_history_for_both_routes(self):
        for kind in ('in', 'out'):
            job = self.create_job(kind)
            payment = CustomerPayment.objects.get(**{f'{kind}_job': job})
            self.assertEqual(payment.amount, Decimal('30.00'))
            self.assertEqual(job.advance, payment.amount)
            self.assertEqual(job.payment_status, 'partial')
            if kind == 'out':
                self.assertEqual(VendorPayment.objects.get(out_job=job).amount, Decimal('20.00'))
                self.assertEqual(job.vendor_payment_status, 'partial')

    def test_paid_fields_and_total_reductions_are_rejected(self):
        for kind in ('in', 'out'):
            job = self.create_job(kind)
            url = reverse(f'libinjobs:{kind}job-detail', args=(job.pk,))
            attempts = [{'advance': '50.00'}, {'payment_status': 'paid'}, {'total_amount': '10.00'}]
            if kind == 'out':
                attempts += [{'vendor_advance': '40.00'}, {'vendor_payment_status': 'paid'}, {'vendor_total_payment': '5.00'}]
            for payload in attempts:
                response = self.client.patch(url, payload, format='json')
                self.assertEqual(response.status_code, 400, (payload, response.data))
            job.refresh_from_db()
            self.assertEqual(job.total_amount, Decimal('100.00'))
            self.assertEqual(job.advance, Decimal('30.00'))

    def test_descriptive_edits_preserve_postings_and_total_changes_recalculate_status(self):
        job = self.create_job('in')
        url = reverse('libinjobs:injob-detail', args=(job.pk,))
        result = self.client.patch(url, {'remarks': 'Revised brief', 'total_amount': '30.00'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        job.refresh_from_db()
        self.assertEqual(job.advance, Decimal('30.00'))
        self.assertEqual(job.payment_status, 'paid')
        self.assertEqual(CustomerPayment.objects.filter(in_job=job).count(), 1)
        posted = self.client.post(reverse('libinjobs:customerpayment-list'), {
            'job_type': 'in', 'job_id': job.pk, 'amount': '1.00', 'payment_date': str(timezone.localdate()),
        }, format='json')
        self.assertEqual(posted.status_code, 400)

    def test_staff_out_job_status_payload_does_not_need_finance_fields(self):
        job = self.create_job('out')
        worker = get_user_model().objects.create_user(username='production-only')
        role = Role.objects.create(name='Production only', default_permissions={'outjobs': True, 'jobboard': True})
        UserProfile.objects.create(user=worker, role=role)
        self.client.force_authenticate(worker)
        for action in ('accept', 'start'):
            self.assertEqual(self.client.post(reverse(f'libinjobs:outjob-{action}', args=(job.pk,))).status_code, 200)
        result = self.client.patch(reverse('libinjobs:outjob-detail', args=(job.pk,)), {'status': 'completed'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertIsNone(result.data['delivery_status'])
        job.refresh_from_db()
        self.assertEqual(job.advance, Decimal('30.00'))

    def test_django_admin_financial_fields_are_read_only(self):
        request = RequestFactory().get('/admin/')
        request.user = self.admin
        for model in (InJob, OutJob):
            registered = admin.site._registry[model]
            readonly = registered.get_readonly_fields(request)
            self.assertIn('advance', readonly)
            self.assertIn('total_amount', readonly)
            self.assertIn('payment_status', readonly)
            self.assertFalse(registered.has_add_permission(request))
