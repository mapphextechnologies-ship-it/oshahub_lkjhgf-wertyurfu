NAV_ITEMS = [('index.html', 'Overview'), ('architecture.html', 'Architecture'), ('api.html', 'API Reference'), ('partner-handbook.html', 'Partner Handbook'), ('database.html', 'Database'), ('security.html', 'Security'), ('providers.html', 'Providers'), ('configuration.html', 'Configuration'), ('admin-guide.html', 'Admin Guide'), ('deployment.html', 'Deployment'), ('troubleshooting.html', 'Troubleshooting'), ('changelog.html', 'Changelog'), ('verification-report.html', 'Verification Report')]

def nav_html(active):
    items = []
    for href, label in NAV_ITEMS:
        cls = ' class="active"' if href == active else ''
        items.append(f'      <a href="{href}"{cls}>{label}</a>')
    return "\n".join(items)
