from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from .models import Quotation, CashTransaction, Role, UserProfile


class QuotationTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(username='quote-admin', password='test-password')
        self.client.force_authenticate(self.user)
        self.url = '/api/quotations/'

    def payload(self, **changes):
        return dict({'customer_name': 'Example customer', 'quotation_date': '2026-10-18',
                     'items': [{'description': 'Business cards', 'quantity': '10', 'unit_price': '20.50'}],
                     'discount': '5', 'gst_percent': '18'}, **changes)

    def test_create_totals_and_edit_items(self):
        response = self.client.post(self.url, self.payload(grand_total='1', totals={'grand_total': '1'}), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['totals'], {'subtotal': '205.00', 'taxable_amount': '200.00', 'gst_amount': '36.00', 'grand_total': '236.00'})
        self.assertTrue(response.data['quotation_number'].startswith('QUO-'))
        changed = self.client.patch(f"{self.url}{response.data['id']}/", {'items': [{'description': 'New item', 'quantity': '2', 'unit_price': '100'}], 'status': 'sent'}, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data['grand_total'], '230.10')
        self.assertFalse(CashTransaction.objects.exists())

    def test_invalid_fields_rejected(self):
        for changes in ({'items': []}, {'discount': '206'}, {'gst_percent': '101'}, {'discount': '-1'},
                        {'valid_until': '2026-10-17'}, {'status': 'invalid'},
                        {'items': [{'description': 'Invalid', 'quantity': '0', 'unit_price': '10'}]}):
            response = self.client.post(self.url, self.payload(**changes), format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Quotation.objects.exists())

    def test_update_checks_existing_discount_and_date(self):
        created = self.client.post(self.url, self.payload(valid_until='2026-10-20'), format='json')
        url = f"{self.url}{created.data['id']}/"
        self.assertEqual(self.client.patch(url, {'quotation_date': '2026-10-21'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'items': [{'description': 'Small', 'quantity': '1', 'unit_price': '1'}]}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 405)

    def test_permission_boundary(self):
        staff = get_user_model().objects.create_user(username='quote-staff')
        role = Role.objects.create(name='Quotation staff', default_permissions={'quotations': True})
        UserProfile.objects.create(user=staff, role=role)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(self.url + 'customers/').status_code, 200)
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 201)
        self.assertEqual(self.client.get('/api/finance-entries/').status_code, 403)
        role.default_permissions = {}
        role.save()
        self.client.force_authenticate(get_user_model().objects.get(pk=staff.pk))
        self.assertEqual(self.client.get(self.url).status_code, 403)
