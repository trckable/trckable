<?php
/**
 * Plugin Name:       trckable – Private, Open-Source Analytics
 * Plugin URI:        https://github.com/trckable/trckable/tree/main/integrations/wordpress
 * Description:       The only analytics you need. Private, free and open source.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Trckable
 * Author URI:        https://trckable.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       trckable
 *
 * Copyright (C) Trckable.
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation; either version 2 of the License, or (at your option) any later
 * version.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

define( 'TRCKABLE_VERSION', '1.0.0' );
define( 'TRCKABLE_FILE', __FILE__ );

require_once __DIR__ . '/includes/class-trckable-options.php';
require_once __DIR__ . '/includes/class-trckable-tracker.php';
require_once __DIR__ . '/includes/class-trckable-proxy.php';
require_once __DIR__ . '/includes/class-trckable-stats.php';
require_once __DIR__ . '/includes/class-trckable-view.php';
require_once __DIR__ . '/includes/class-trckable-page-parts.php';
require_once __DIR__ . '/includes/class-trckable-page.php';
require_once __DIR__ . '/includes/class-trckable-ajax.php';
require_once __DIR__ . '/includes/class-trckable-widget.php';
require_once __DIR__ . '/includes/class-trckable-settings.php';

Trckable_Tracker::init();
Trckable_Proxy::init();
Trckable_Widget::init();
Trckable_Settings::init();
Trckable_Ajax::init();
