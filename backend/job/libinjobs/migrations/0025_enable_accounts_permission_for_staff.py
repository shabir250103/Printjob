from django.db import migrations


def enable_accounts_permission(apps, schema_editor):
    Role = apps.get_model('libinjobs', 'Role')
    database = schema_editor.connection.alias

    for role in Role.objects.using(database).filter(is_active=True):
        defaults = dict(role.default_permissions or {})
        if defaults.get('delivery') or defaults.get('injobs') or defaults.get('outjobs'):
            defaults['accounts'] = True
            role.default_permissions = defaults
            role.save(using=database, update_fields=['default_permissions'])


class Migration(migrations.Migration):
    dependencies = [
        ('libinjobs', '0024_companysettings_invoice_snapshot_fields'),
    ]

    operations = [
        migrations.RunPython(enable_accounts_permission, migrations.RunPython.noop),
    ]
