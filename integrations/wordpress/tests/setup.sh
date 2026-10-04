#!/usr/bin/env bash
# Makes a throwaway WordPress for the smoke test: PHP's own server, SQLite
# instead of MySQL, the plugin installed from the built zip, three users.
# Needs php, wp (WP-CLI), curl and unzip.
#   tests/setup.sh <directory>        (then: cd e2e && playwright test -c wordpress/wordpress.config.ts)
set -euo pipefail

dir="${1:?usage: setup.sh <directory>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wp_port="${WP_PORT:-19401}"
mock_port="${MOCK_PORT:-19400}"
# WP-CLI as a function: a bigger memory limit, and no deprecation noise from a newer PHP.
wp_bin="$(command -v wp)"
wp() { php -d memory_limit=512M -d "error_reporting=E_ALL&~E_DEPRECATED" "$wp_bin" "$@"; }

mkdir -p "$dir"
cd "$dir"
[ -f wordpress/wp-load.php ] || wp core download --path=wordpress --force --quiet
plugins=wordpress/wp-content/plugins
if [ ! -d "$plugins/sqlite-database-integration" ]; then
	curl -fsSLo sqlite.zip https://downloads.wordpress.org/plugin/sqlite-database-integration.zip
	unzip -q sqlite.zip -d "$plugins"
fi
sed -e "s#{SQLITE_IMPLEMENTATION_FOLDER_PATH}#$PWD/$plugins/sqlite-database-integration#" -e "s#{SQLITE_PLUGIN}#sqlite-database-integration/load.php#" \
	"$plugins/sqlite-database-integration/db.copy" >wordpress/wp-content/db.php

cd wordpress
rm -f wp-config.php wp-content/database/.ht.sqlite
wp config create --dbname=wp --dbuser=wp --dbpass=wp --skip-check --quiet --extra-php <<'PHP'
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_DEBUG_LOG', true );
PHP
wp core install --url="http://127.0.0.1:$wp_port" --title="trckable test" --admin_user=admin --admin_password=admin-local-test \
	--admin_email=admin@example.test --skip-email --quiet
wp rewrite structure '/%postname%/' --quiet
wp user create editor editor@example.test --role=editor --user_pass=editor-local-test --quiet
wp user create reader reader@example.test --role=subscriber --user_pass=reader-local-test --quiet

"$here/../build.sh" "$dir/trckable.zip" >/dev/null
wp plugin install "$dir/trckable.zip" --force --activate --quiet
wp option update trckable_settings "{\"site\":\"tkb_test00000001\",\"server\":\"own\",\"host\":\"http://127.0.0.1:$mock_port\",\"cookieless\":0,\"exclude_staff\":1,\"exclude_roles\":[],\"proxy\":0,\"proxy_key\":\"\",\"api_key\":\"\"}" --format=json --quiet
echo "ready: $dir/wordpress"
