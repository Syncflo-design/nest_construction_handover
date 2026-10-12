app_name        = "nest_construction_handover"
app_title       = "Nest Construction Handover"
app_publisher   = "NestERP / Syncflo"
app_description = "Two-signature stock handover dockets between main store, vans and site stores, built to work with no signal."
app_email       = "ops@syncflo.co.za"
app_license     = "MIT"
app_icon        = "octicon octicon-arrow-switch"

# Custom fields on Warehouse and User. See install.py. Re-applied on migrate so
# fields added later reach sites that already have the app.
after_install = "nest_construction_handover.install.after_install"
after_migrate = "nest_construction_handover.install.after_install"
