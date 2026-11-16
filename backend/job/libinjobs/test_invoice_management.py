import io
from decimal import Decimal
from PIL import Image
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import (
    CompanySettings, Customer, Delivery, InJob, Invoice, Quotation, Role, UserProfile
)
from .services import auto_generate_invoice


def create_test_image(name='test.png'):
    file = io.BytesIO()
    image = Image.new('RGBA', size=(50, 50), color=(255, 0, 0, 0))
    image.save(file, 'png')
    file.name = name
    file.seek(0)
    return SimpleUploadedFile(name, file.read(), content_type='image/png')


class CompanySettingsAndInvoiceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin', email='admin@libinprints.com', password='password123'
        )
        self.role = Role.objects.create(
            name='Manager',
            default_permissions={'accounts': True, 'company_settings': True, 'quotations': True, 'delivery': True, 'injobs': True}
        )
        self.profile = UserProfile.objects.create(user=self.admin, role=self.role)
        self.client.force_authenticate(user=self.admin)

        # Create company settings
        self.company = CompanySettings.objects.create(
            company_name='Libin Prints Pvt Ltd',
            address='123 Print Street, Coimbatore, Tamil Nadu - 641001',
            gstin='33AAAAA0000A1Z5',  # Tamil Nadu (33)
            contact_number='+91 9876543210',
            email='info@libinprints.com',
            authorized_person_name='Libin K',
            authorized_person_designation='Managing Director',
            terms_and_conditions='1. Goods once sold will not be taken back.\n2. Payment within 15 days.',
            bank_name='HDFC Bank',
            bank_account_number='50200012345678',
            bank_ifsc='HDFC0001234',
        )

        # Create customer (Tamil Nadu, intra-state)
        self.customer_tn = Customer.objects.create(
            name='ABC Corp',
            mobile='9876501234',
            billing_address='Anna Nagar, Chennai, Tamil Nadu - 600040',
            gst_number='33BBBBB1111B1Z2',
        )

        # Create customer (Kerala, inter-state)
        self.customer_kl = Customer.objects.create(
            name='XYZ Ventures',
            mobile='9876505678',
            billing_address='MG Road, Kochi, Kerala - 682016',
            gst_number='32CCCCC2222C1Z3',
        )

    def test_company_settings_singleton_and_update(self):
        """Only one CompanySettings instance can exist; second create updates the first."""
        url = reverse('libinjobs:companysettings-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['company_name'], 'Libin Prints Pvt Ltd')

        # Create another via API should update the existing singleton
        update_data = {
            'company_name': 'Libin Prints Global',
            'gstin': '33AAAAA0000A1Z5',
            'contact_number': '+91 9999999999',
            'email': 'contact@libinglobal.com',
        }
        res = self.client.post(url, update_data)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(CompanySettings.objects.count(), 1)
        self.company.refresh_from_db()
        self.assertEqual(self.company.company_name, 'Libin Prints Global')

    def test_company_settings_gstin_validation(self):
        """Invalid GSTIN format should be rejected with 400."""
        url = reverse('libinjobs:companysettings-list')
        res = self.client.post(url, {
            'company_name': 'Test',
            'gstin': 'INVALID_GSTIN_123',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('gstin', res.data)

    def test_auto_invoice_on_delivery_delivered_status(self):
        """When delivery status transitions to DELIVERED, invoice is auto-generated."""
        job = InJob.objects.create(
            job_number='IN-2026-0001',
            job_type='Flyer Printing',
            customer=self.customer_tn,
            customer_name='ABC Corp',
            contact_number='9876501234',
            quantity=1000,
            total_amount=Decimal('5000.00'),
            advance=Decimal('5000.00'),
            printing_status=InJob.ProductionStatus.COMPLETED,
            finishing_status=InJob.ProductionStatus.COMPLETED,
            created_by=self.admin,
        )
        delivery = Delivery.objects.create(
            in_job=job,
            status=Delivery.Status.PENDING,
            address='Anna Nagar, Chennai',
            created_by=self.admin,
        )

        # Initially no invoice
        self.assertFalse(Invoice.objects.filter(in_job=job).exists())

        # Update status to READY (should NOT generate invoice)
        delivery.status = Delivery.Status.READY
        delivery.save()
        self.assertFalse(Invoice.objects.filter(in_job=job).exists())

        # Update status to DELIVERED via viewset API (simulate frontend action)
        url = reverse('libinjobs:delivery-detail', kwargs={'pk': delivery.pk})
        res = self.client.patch(url, {'status': Delivery.Status.DELIVERED})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Invoice should now exist!
        invoice = Invoice.objects.filter(in_job=job).first()
        self.assertIsNotNone(invoice)
        self.assertTrue(invoice.invoice_no.startswith('INV-'))
        self.assertEqual(invoice.subtotal, Decimal('5000.00'))
        self.assertEqual(invoice.grand_total, Decimal('5900.00'))  # 5000 + 18% GST (900)
        self.assertEqual(invoice.payment_status, 'paid')  # 5000 advance covers 5000 subtotal

        # Check immutable snapshots
        self.assertEqual(invoice.company_name_snapshot, 'Libin Prints Pvt Ltd')
        self.assertEqual(invoice.company_gstin_snapshot, '33AAAAA0000A1Z5')
        self.assertEqual(invoice.customer_name_snapshot, 'ABC Corp')
        self.assertEqual(invoice.customer_gstin_snapshot, '33BBBBB1111B1Z2')
        self.assertEqual(invoice.order_reference, 'IN-2026-0001')
        self.assertIn('Five Thousand Nine Hundred', invoice.amount_in_words)

    def test_invoice_idempotency_prevents_duplicates(self):
        """Repeated delivery updates or service calls must never create duplicate invoices."""
        job = InJob.objects.create(
            job_number='IN-2026-0002',
            job_type='Brochure',
            customer=self.customer_tn,
            customer_name='ABC Corp',
            quantity=500,
            total_amount=Decimal('3000.00'),
            advance=Decimal('3540.00'),
            created_by=self.admin,
        )
        delivery = Delivery.objects.create(
            in_job=job,
            status=Delivery.Status.DELIVERED,
            created_by=self.admin,
        )

        inv1 = auto_generate_invoice(delivery, self.admin)
        inv2 = auto_generate_invoice(delivery, self.admin)
        inv3 = auto_generate_invoice(delivery, self.admin)

        self.assertEqual(inv1.pk, inv2.pk)
        self.assertEqual(inv2.pk, inv3.pk)
        self.assertEqual(Invoice.objects.filter(in_job=job).count(), 1)
        self.assertEqual(inv1.payment_status, 'paid')

    def test_gst_place_of_supply_cgst_sgst_vs_igst(self):
        """Intra-state (same state code) splits to CGST + SGST; Inter-state applies IGST."""
        # Intra-state: Company TN (33) to Customer TN (33)
        job_intra = InJob.objects.create(
            job_number='IN-2026-0003',
            job_type='Cards',
            customer=self.customer_tn,
            customer_name='ABC Corp',
            quantity=100,
            total_amount=Decimal('1000.00'),
            created_by=self.admin,
        )
        delivery_intra = Delivery.objects.create(in_job=job_intra, status=Delivery.Status.DELIVERED, created_by=self.admin)
        inv_intra = auto_generate_invoice(delivery_intra, self.admin)

        self.assertFalse(inv_intra.is_igst_applicable)
        self.assertEqual(inv_intra.cgst_amount, Decimal('90.00'))  # 18% of 1000 = 180 / 2 = 90
        self.assertEqual(inv_intra.sgst_amount, Decimal('90.00'))

        # Inter-state: Company TN (33) to Customer KL (32)
        job_inter = InJob.objects.create(
            job_number='IN-2026-0004',
            job_type='Banners',
            customer=self.customer_kl,
            customer_name='XYZ Ventures',
            quantity=10,
            total_amount=Decimal('2000.00'),
            created_by=self.admin,
        )
        delivery_inter = Delivery.objects.create(in_job=job_inter, status=Delivery.Status.DELIVERED, created_by=self.admin)
        inv_inter = auto_generate_invoice(delivery_inter, self.admin)

        self.assertTrue(inv_inter.is_igst_applicable)
        self.assertEqual(inv_inter.gst_amount, Decimal('360.00'))  # 18% of 2000 = 360 IGST

    def test_invoice_preview_data_endpoint(self):
        """Invoice preview-data action returns enriched payload with company & line items."""
        job = InJob.objects.create(
            job_number='IN-2026-0005',
            job_type='Signboard',
            customer=self.customer_tn,
            customer_name='ABC Corp',
            quantity=1,
            total_amount=Decimal('8000.00'),
            created_by=self.admin,
        )
        delivery = Delivery.objects.create(in_job=job, status=Delivery.Status.DELIVERED, created_by=self.admin)
        invoice = auto_generate_invoice(delivery, self.admin)

        url = reverse('libinjobs:invoice-preview-data', kwargs={'pk': invoice.pk})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('line_items', res.data)
        self.assertIn('company', res.data)
        self.assertEqual(res.data['company']['company_name'], 'Libin Prints Pvt Ltd')
        self.assertEqual(len(res.data['line_items']), 1)
        self.assertEqual(res.data['line_items'][0]['description'], 'Signboard')

    def test_quotation_preview_data_endpoint(self):
        """Quotation preview-data returns quote + company branding."""
        quote = Quotation.objects.create(
            customer=self.customer_tn,
            customer_name='ABC Corp',
            contact_number='9876501234',
            quotation_date='2026-11-14',
            items=[{'description': 'Brochure 1000 pcs', 'quantity': '1', 'unit_price': '4500.00'}],
            discount=Decimal('500.00'),
            gst_percent=Decimal('18.00'),
            notes='Delivery in 3 business days',
            created_by=self.admin,
        )

        url = reverse('libinjobs:quotation-preview-data', kwargs={'pk': quote.pk})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('company', res.data)
        self.assertEqual(res.data['company']['company_name'], 'Libin Prints Pvt Ltd')
        self.assertEqual(res.data['customer_name'], 'ABC Corp')
        self.assertEqual(res.data['totals']['taxable_amount'], '4000.00')
        self.assertEqual(res.data['totals']['grand_total'], '4720.00')
