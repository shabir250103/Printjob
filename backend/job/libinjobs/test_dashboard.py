from decimal import Decimal
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import CashAccount, Customer, CustomerPayment, InJob, ModulePermissionOverride, OutJob, StockItem, UserProfile


class DashboardEnhancementTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='dash-admin', password='password123')
        self.staff = get_user_model().objects.create_user(username='dash-staff', password='password123')
        UserProfile.objects.create(user=self.staff)
        ModulePermissionOverride.objects.create(
            user=self.staff, module='dashboard', access=ModulePermissionOverride.Access.ALLOW
        )

        self.account_bank = CashAccount.objects.create(name='Bank', account_type='net_bank', balance=Decimal('5000.00'))
        self.account_petty = CashAccount.objects.create(name='Petty', account_type='petty', balance=Decimal('1200.00'))

        self.customer = Customer.objects.create(name='Test Customer', mobile='9876543210')

        # Stock items: one normal, one low stock
        self.stock_ok = StockItem.objects.create(
            name='300gsm Art Board', category='paper', current_stock=Decimal('1000.00'), min_stock=Decimal('200.00')
        )
        self.stock_low = StockItem.objects.create(
            name='250gsm Matt Paper', category='paper', current_stock=Decimal('50.00'), min_stock=Decimal('100.00')
        )

        # InJob: Completed production but payment pending
        self.in_job = InJob.objects.create(
            customer=self.customer, customer_name=self.customer.name, job_type='Brochure',
            quantity=100, sheet_count=50, total_amount=Decimal('2000.00'), advance=Decimal('500.00'),
            printing_status='completed', finishing_status='completed',
            priority='normal', created_by=self.admin,
        )

        # OutJob: Urgent priority
        self.out_job_urgent = OutJob.objects.create(
            customer=self.customer, customer_name=self.customer.name, vendor='External Print Co',
            job_type='Flex Banner', quantity=10, total_amount=Decimal('3500.00'), advance=Decimal('1000.00'),
            vendor_total_payment=Decimal('2000.00'), vendor_advance=Decimal('500.00'),
            priority='urgent', status='in_progress', created_by=self.admin,
        )

    def test_superuser_dashboard_financials_and_alerts(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.data

        # Low stock checks
        self.assertGreaterEqual(data['low_stock_items'], 1)
        self.assertTrue(any(item['id'] == self.stock_low.id for item in data['low_stock_list']))

        # Action required jobs
        action_job_ids = [j['id'] for j in data['action_required_jobs']]
        self.assertIn(self.in_job.id, action_job_ids)
        self.assertIn(self.out_job_urgent.id, action_job_ids)

        # Financial amounts
        self.assertTrue(data['has_finance_access'])
        self.assertEqual(data['available_cash'], 6200.0)
        self.assertEqual(len(data['cash_accounts']), 2)
        # Receivables: (2000 - 500) + (3500 - 1000) = 1500 + 2500 = 4000
        self.assertEqual(data['total_receivables'], 4000.0)
        # Payables: 2000 - 500 = 1500
        self.assertEqual(data['total_payables'], 1500.0)

        # Dynamic charts data
        self.assertEqual(len(data['trend_days']), 7)
        self.assertTrue(any(stage['label'] == 'Printing' for stage in data['stages_breakdown']))

    def test_staff_without_finance_does_not_see_sensitive_financials(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.data

        # Operational alerts are visible
        self.assertGreaterEqual(data['low_stock_items'], 1)
        self.assertGreaterEqual(len(data['action_required_jobs']), 1)

        # Sensitive financial amounts are gated
        self.assertFalse(data['has_finance_access'])
        self.assertEqual(data['total_receivables'], 0)
        self.assertEqual(data['total_payables'], 0)
        self.assertEqual(data['cash_accounts'], [])

    def test_staff_with_finance_override_sees_financials(self):
        ModulePermissionOverride.objects.create(
            user=self.staff, module='finance', access=ModulePermissionOverride.Access.ALLOW
        )
        self.client.force_authenticate(self.staff)
        response = self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertTrue(data['has_finance_access'])
        self.assertEqual(data['available_cash'], 6200.0)
        self.assertEqual(data['total_receivables'], 4000.0)

    def test_unified_finance_ledger(self):
        # Create a customer payment and a vendor payment
        CustomerPayment.objects.create(
            in_job=self.in_job, amount=Decimal('500.00'), payment_date=timezone.localdate(),
            cash_account=self.account_bank, recorded_by=self.admin, method='UPI', reference_no='UPI-123'
        )
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/finance-entries/unified-ledger/')
        self.assertEqual(response.status_code, 200)
        entries = response.data['entries']
        self.assertGreaterEqual(len(entries), 1)
        receipt = next((e for e in entries if e['type_key'] == 'customer_payment'), None)
        self.assertIsNotNone(receipt)
        self.assertEqual(receipt['credit'], 500.0)
        self.assertEqual(receipt['debit'], 0.0)
        self.assertIn('Receipt for', receipt['reason'])
        summary = response.data['summary']
        self.assertIn('total_receivables', summary)
        self.assertIn('total_payables', summary)
        self.assertIn('total_net_profit', summary)
        self.assertGreaterEqual(summary['total_receivables'], 0)
        self.assertGreaterEqual(summary['total_payables'], 0)
        self.assertGreaterEqual(summary['total_net_profit'], 0)

