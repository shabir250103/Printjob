from django.contrib import admin

from .models import (
    Supplier, FinanceEntry,
    CashAccount, CashTransaction, CashTransfer, Customer, CustomerPayment,
    CustomerType, Delivery, Department, InJob, InJobDropdownOption, Invoice, JobDocument, Machine,
    MachineCounter, MachineStatusHistory, OutJob, PipelineJob, StockItem,
    StockMovement, VendorPayment, WastageRecord, FollowUp, Notification,
    ModulePermissionOverride, Role, UserProfile,
)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'slug')


@admin.register(CustomerType)
class CustomerTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'mobile', 'gst_number', 'customer_type', 'is_active')
    list_filter = ('customer_type', 'is_active')
    search_fields = ('name', 'mobile', 'gst_number')


@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'location', 'operational_status', 'is_default', 'is_active')
    list_filter = ('operational_status', 'is_default', 'is_active')
    search_fields = ('code', 'name', 'location')


@admin.register(StockItem)
class StockItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'color', 'gsm', 'size', 'current_stock', 'min_stock', 'unit', 'is_active')
    list_filter = ('category', 'is_active')
    search_fields = ('name', 'color', 'size')


@admin.register(PipelineJob)
class PipelineJobAdmin(admin.ModelAdmin):
    list_display = ('job_number', 'client_name', 'job_type', 'priority', 'status', 'job_date', 'assigned_designer')
    list_filter = ('priority', 'status', 'job_date')
    search_fields = ('job_number', 'client_name', 'contact_number', 'job_type')
    readonly_fields = ('job_number', 'created_at', 'updated_at')


class JobAdmin(admin.ModelAdmin):
    """Financial writes belong to the application's validated workflows."""
    financial_fields = (
        'total_amount', 'advance', 'expenses', 'payment_status', 'payment_option',
        'invoice_no', 'gst_percent', 'supplier_expenses', 'vendor_total_payment',
        'vendor_advance', 'vendor_payment_status',
    )

    def get_readonly_fields(self, request, obj=None):
        available = {field.name for field in self.model._meta.fields}
        return (*super().get_readonly_fields(request, obj), *(field for field in self.financial_fields if field in available))

    def has_add_permission(self, request):
        return False  # Create through the application so opening advances are posted.

    def save_model(self, request, obj, form, change):
        if change:
            concrete = {field.name for field in self.model._meta.fields}
            changed = [field for field in form.changed_data if field in concrete and field not in self.financial_fields]
            obj.save(update_fields=[*changed, 'updated_at'])
        else:
            super().save_model(request, obj, form, change)


@admin.register(InJob)
class InJobAdmin(JobAdmin):
    list_display = ('job_number', 'customer_name', 'job_type', 'priority', 'printing_status', 'finishing_status', 'payment_status')
    list_filter = ('priority', 'printing_status', 'finishing_status', 'payment_status')
    search_fields = ('job_number', 'customer_name', 'contact_number', 'job_type', 'invoice_no')
    filter_horizontal = ('assigned_users', 'assigned_departments')
    readonly_fields = ('job_number', 'created_at', 'updated_at')


@admin.register(InJobDropdownOption)
class InJobDropdownOptionAdmin(admin.ModelAdmin):
    list_display = ('field_name', 'label', 'base_value', 'is_active', 'created_by')
    list_filter = ('field_name', 'is_active')
    search_fields = ('label',)


@admin.register(OutJob)
class OutJobAdmin(JobAdmin):
    list_display = ('job_number', 'customer_name', 'vendor', 'job_type', 'priority', 'status', 'payment_status')
    list_filter = ('priority', 'status', 'payment_status', 'vendor_payment_status')
    search_fields = ('job_number', 'customer_name', 'vendor', 'job_type', 'invoice_no')
    filter_horizontal = ('assigned_users', 'assigned_departments')
    readonly_fields = ('job_number', 'created_at', 'updated_at')


@admin.register(JobDocument)
class JobDocumentAdmin(admin.ModelAdmin):
    list_display = ('original_name', 'kind', 'pipeline_job', 'in_job', 'out_job', 'uploaded_by', 'created_at')
    list_filter = ('kind', 'created_at')
    search_fields = ('original_name',)


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = ('job', 'status', 'delivery_date', 'method', 'transport_company', 'delivery_charges')
    list_filter = ('status', 'delivery_date')
    search_fields = ('in_job__job_number', 'out_job__job_number', 'contact_person', 'contact_number')


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('stock_item', 'movement_type', 'quantity', 'balance_after', 'reason', 'created_by', 'created_at')
    list_filter = ('movement_type', 'created_at')
    search_fields = ('stock_item__name', 'reason', 'in_job__job_number', 'out_job__job_number')
    readonly_fields = ('stock_item', 'movement_type', 'quantity', 'balance_after', 'reason', 'in_job', 'out_job', 'created_by', 'created_at', 'updated_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(MachineCounter)
class MachineCounterAdmin(admin.ModelAdmin):
    list_display = ('machine', 'count_date', 'operator', 'morning_count', 'ending_count', 'actual_clicks', 'calculated_job_clicks_booked', 'difference')
    list_filter = ('machine', 'count_date')
    search_fields = ('machine__code', 'machine__name', 'operator__username')


@admin.register(MachineStatusHistory)
class MachineStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ('machine', 'previous_status', 'new_status', 'reason', 'changed_by', 'created_at')
    list_filter = ('previous_status', 'new_status', 'created_at')
    readonly_fields = ('machine', 'previous_status', 'new_status', 'reason', 'changed_by', 'created_at', 'updated_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(WastageRecord)
class WastageRecordAdmin(admin.ModelAdmin):
    list_display = ('wastage_type', 'quantity', 'machine', 'stock_item', 'in_job', 'out_job', 'wastage_date', 'recorded_by')
    list_filter = ('wastage_type', 'machine', 'wastage_date')
    search_fields = ('reason', 'in_job__job_number', 'out_job__job_number')


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_no', 'job', 'invoice_date', 'subtotal', 'gst_percent', 'gst_amount', 'grand_total')
    list_filter = ('invoice_date',)
    search_fields = ('invoice_no', 'in_job__job_number', 'out_job__job_number')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CashAccount)
class CashAccountAdmin(admin.ModelAdmin):
    list_display = ('name', 'account_type', 'balance', 'is_active', 'updated_at')
    list_filter = ('account_type', 'is_active')
    readonly_fields = ('balance', 'created_at', 'updated_at')


class AppendOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FinanceEntry)
class FinanceEntryAdmin(AppendOnlyAdmin):
    list_display = ('entry_date', 'entry_type', 'amount', 'account', 'category', 'created_by')
    list_filter = ('entry_type', 'account', 'entry_date')
    search_fields = ('description', 'reference_no')


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ('name', 'mobile', 'contact_person', 'is_active')
    search_fields = ('name', 'mobile')

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CustomerPayment)
class CustomerPaymentAdmin(AppendOnlyAdmin):
    list_display = ('job', 'amount', 'payment_type', 'payment_date', 'method', 'cash_account', 'recorded_by')
    list_filter = ('payment_type', 'payment_date', 'cash_account')
    search_fields = ('in_job__job_number', 'out_job__job_number', 'reference_no')


@admin.register(VendorPayment)
class VendorPaymentAdmin(AppendOnlyAdmin):
    list_display = ('out_job', 'amount', 'payment_date', 'method', 'cash_account', 'recorded_by')
    list_filter = ('payment_date', 'cash_account')
    search_fields = ('out_job__job_number', 'out_job__vendor', 'reference_no')


@admin.register(CashTransaction)
class CashTransactionAdmin(AppendOnlyAdmin):
    list_display = ('account', 'transaction_type', 'amount', 'balance_after', 'transaction_date', 'description', 'created_by')
    list_filter = ('account', 'transaction_type', 'transaction_date')
    search_fields = ('description', 'remarks')


@admin.register(CashTransfer)
class CashTransferAdmin(AppendOnlyAdmin):
    list_display = ('source', 'destination', 'amount', 'transfer_date', 'reason', 'created_by')
    list_filter = ('source', 'destination', 'transfer_date')
    search_fields = ('reason',)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'department', 'is_active', 'updated_at')
    list_filter = ('role', 'department', 'is_active')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email')


@admin.register(ModulePermissionOverride)
class ModulePermissionOverrideAdmin(admin.ModelAdmin):
    list_display = ('user', 'module', 'access', 'updated_at')
    list_filter = ('module', 'access')
    search_fields = ('user__username',)


@admin.register(FollowUp)
class FollowUpAdmin(admin.ModelAdmin):
    list_display = ('customer_name', 'follow_up_date', 'job_type', 'quote', 'assigned_to', 'is_completed')
    list_filter = ('is_completed', 'follow_up_date', 'assigned_to')
    search_fields = ('customer__name', 'customer_name', 'job_type', 'remarks')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'notification_type', 'title', 'is_read', 'created_at')
    list_filter = ('notification_type', 'read_at', 'created_at')
    search_fields = ('recipient__username', 'title', 'message')
    readonly_fields = ('created_at', 'updated_at')
