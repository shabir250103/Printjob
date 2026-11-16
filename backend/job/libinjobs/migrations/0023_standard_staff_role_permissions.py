from django.db import migrations


def update_staff_role_permissions(apps, schema_editor):
    Role = apps.get_model('libinjobs', 'Role')
    database = schema_editor.connection.alias

    operational_modules = (
        'dashboard', 'pipeline', 'jobboard', 'injobs', 'outjobs',
        'delivery', 'stock', 'customers', 'suppliers', 'machine',
        'wastage', 'notifications', 'followups', 'quotations', 'reports',
    )

    for role in Role.objects.using(database).filter(is_active=True):
        defaults = dict(role.default_permissions or {})
        if any(defaults.get(m) for m in ('injobs', 'pipeline', 'jobboard')):
            for m in operational_modules:
                defaults[m] = True
            for m in ('finance', 'cash', 'accounts', 'users', 'permissions'):
                defaults.setdefault(m, False)
            role.default_permissions = defaults
            role.save(using=database, update_fields=['default_permissions'])


class Migration(migrations.Migration):
    dependencies = [
        ('libinjobs', '0022_userprofile_show_payment_details'),
    ]

    operations = [
        migrations.RunPython(update_staff_role_permissions, migrations.RunPython.noop),
    ]
