from django import forms

from .models import (
    Supplier,
    Customer,
    CustomerPayment,
    CustomerType,
    CashAccount,
    CashTransfer,
    Delivery,
    Department,
    FollowUp,
    InJob,
    Invoice,
    JobDocument,
    Machine,
    MachineCounter,
    ModulePermissionOverride,
    Notification,
    OutJob,
    PipelineJob,
    StockItem,
    Role,
    UserProfile,
    WastageRecord,
    VendorPayment,
)


class SupplierForm(forms.ModelForm):
    class Meta:
        model = Supplier
        fields = ('name', 'contact_person', 'mobile', 'email', 'gst_number', 'address', 'services', 'notes', 'is_active')


class FinanceEntryForm(forms.Form):
    # Posting must go through record_finance_entry; ModelForm.save would bypass cash posting.
    entry_type = forms.ChoiceField(choices=(('credit', 'Credit'), ('debit', 'Debit'), ('expense', 'Expense')))
    amount = forms.DecimalField(max_digits=14, decimal_places=2, min_value=0.01)
    entry_date = forms.DateField(widget=forms.DateInput(attrs={'type': 'date'}))
    account = forms.ModelChoiceField(queryset=CashAccount.objects.filter(is_active=True))
    supplier = forms.ModelChoiceField(queryset=Supplier.objects.filter(is_active=True), required=False)
    category = forms.CharField(max_length=100, required=False)
    description = forms.CharField(max_length=255)
    reference_no = forms.CharField(max_length=100, required=False)
    request_key = forms.UUIDField()


class DepartmentForm(forms.ModelForm):
    class Meta:
        model = Department
        fields = ('name', 'is_active')


class CustomerTypeForm(forms.ModelForm):
    class Meta:
        model = CustomerType
        fields = ('name', 'is_active')


class CustomerForm(forms.ModelForm):
    class Meta:
        model = Customer
        fields = ('name', 'mobile', 'gst_number', 'address', 'customer_type', 'is_active')
        widgets = {'address': forms.Textarea(attrs={'rows': 3})}

    def clean_gst_number(self):
        value = self.cleaned_data.get('gst_number', '').strip().upper()
        if value and len(value) != 15:
            raise forms.ValidationError('GST number must contain exactly 15 characters.')
        return value


class MachineForm(forms.ModelForm):
    class Meta:
        model = Machine
        fields = (
            'code', 'name', 'location', 'operational_status', 'status_reason',
            'is_default', 'is_active',
        )


class StockItemForm(forms.ModelForm):
    class Meta:
        model = StockItem
        fields = (
            'name', 'category', 'color', 'gsm', 'size', 'current_stock',
            'min_stock', 'unit', 'is_active',
        )


class PipelineJobForm(forms.ModelForm):
    class Meta:
        model = PipelineJob
        exclude = ('job_number', 'created_by')
        widgets = {
            'job_date': forms.DateInput(attrs={'type': 'date'}),
            'quote': forms.Textarea(attrs={'rows': 3}),
            'remarks': forms.Textarea(attrs={'rows': 3}),
        }


class InJobForm(forms.ModelForm):
    class Meta:
        model = InJob
        exclude = ('job_number', 'created_by')
        widgets = {
            'job_date': forms.DateInput(attrs={'type': 'date'}),
            'remarks': forms.Textarea(attrs={'rows': 3}),
        }


class OutJobForm(forms.ModelForm):
    class Meta:
        model = OutJob
        exclude = ('job_number', 'created_by')
        widgets = {
            'delivery_date': forms.DateInput(attrs={'type': 'date'}),
            'description': forms.Textarea(attrs={'rows': 3}),
            'remarks': forms.Textarea(attrs={'rows': 3}),
        }


class JobDocumentForm(forms.ModelForm):
    class Meta:
        model = JobDocument
        exclude = ('uploaded_by', 'original_name')


class DeliveryForm(forms.ModelForm):
    class Meta:
        model = Delivery
        exclude = ('created_by',)
        widgets = {
            'delivery_date': forms.DateInput(attrs={'type': 'date'}),
            'address': forms.Textarea(attrs={'rows': 3}),
            'instructions': forms.Textarea(attrs={'rows': 3}),
        }


class MachineCounterForm(forms.ModelForm):
    class Meta:
        model = MachineCounter
        exclude = ('operator',)
        widgets = {'count_date': forms.DateInput(attrs={'type': 'date'})}


class WastageRecordForm(forms.ModelForm):
    class Meta:
        model = WastageRecord
        exclude = ('recorded_by',)
        widgets = {
            'wastage_date': forms.DateInput(attrs={'type': 'date'}),
            'reason': forms.Textarea(attrs={'rows': 3}),
        }


class InvoiceForm(forms.ModelForm):
    class Meta:
        model = Invoice
        exclude = ('created_by',)
        widgets = {
            'invoice_date': forms.DateInput(attrs={'type': 'date'}),
            'notes': forms.Textarea(attrs={'rows': 3}),
        }


class CustomerPaymentForm(forms.ModelForm):
    class Meta:
        model = CustomerPayment
        exclude = ('recorded_by',)
        widgets = {'payment_date': forms.DateInput(attrs={'type': 'date'})}


class VendorPaymentForm(forms.ModelForm):
    class Meta:
        model = VendorPayment
        exclude = ('recorded_by',)
        widgets = {'payment_date': forms.DateInput(attrs={'type': 'date'})}


class CashAccountForm(forms.ModelForm):
    class Meta:
        model = CashAccount
        fields = ('name', 'account_type', 'balance', 'is_active')


class CashTransferForm(forms.ModelForm):
    class Meta:
        model = CashTransfer
        exclude = ('created_by',)
        widgets = {'transfer_date': forms.DateInput(attrs={'type': 'date'})}


class RoleForm(forms.ModelForm):
    class Meta:
        model = Role
        fields = ('name', 'default_permissions', 'is_active')


class UserProfileForm(forms.ModelForm):
    class Meta:
        model = UserProfile
        fields = ('user', 'role', 'department', 'is_active')


class ModulePermissionOverrideForm(forms.ModelForm):
    class Meta:
        model = ModulePermissionOverride
        fields = ('user', 'module', 'access')


class FollowUpForm(forms.ModelForm):
    class Meta:
        model = FollowUp
        exclude = ('created_by',)
        widgets = {
            'follow_up_date': forms.DateInput(attrs={'type': 'date'}),
            'quote': forms.Textarea(attrs={'rows': 3}),
            'remarks': forms.Textarea(attrs={'rows': 3}),
        }


class NotificationForm(forms.ModelForm):
    class Meta:
        model = Notification
        fields = ('recipient', 'notification_type', 'title', 'message', 'target_url')
