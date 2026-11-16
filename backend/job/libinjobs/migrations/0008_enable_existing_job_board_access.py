from django.db import migrations


def preserve_board_access(apps, schema_editor):
    Role = apps.get_model('libinjobs', 'Role')
    UserProfile = apps.get_model('libinjobs', 'UserProfile')
    Override = apps.get_model('libinjobs', 'ModulePermissionOverride')
    database = schema_editor.connection.alias

    for role in Role.objects.using(database).all():
        defaults = dict(role.default_permissions or {})
        if 'jobboard' not in defaults:
            defaults['jobboard'] = bool(defaults.get('injobs') or defaults.get('outjobs'))
            role.default_permissions = defaults
            role.save(using=database, update_fields=['default_permissions'])

    for profile in UserProfile.objects.using(database).select_related('role').filter(role__isnull=False):
        if profile.role.default_permissions.get('jobboard'):
            continue
        overrides = {
            item.module: item.access
            for item in Override.objects.using(database).filter(user_id=profile.user_id, module__in=['injobs', 'outjobs'])
        }
        allowed = any(
            overrides.get(module, 'default') == 'allow' or
            (overrides.get(module, 'default') == 'default' and profile.role.default_permissions.get(module, False))
            for module in ('injobs', 'outjobs')
        )
        if allowed:
            Override.objects.using(database).get_or_create(
                user_id=profile.user_id, module='jobboard', defaults={'access': 'allow'},
            )


class Migration(migrations.Migration):
    dependencies = [('libinjobs', '0007_alter_modulepermissionoverride_module')]

    operations = [migrations.RunPython(preserve_board_access, migrations.RunPython.noop)]
