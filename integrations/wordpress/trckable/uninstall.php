<?php
/**
 * Removes everything the plugin stored. Runs when the plugin is deleted.
 *
 * @package trckable
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Deletes the options and cached answers of the site that is current.
 *
 * @return void
 */
function trckable_uninstall_site() {
	delete_option( 'trckable_settings' );
	delete_transient( 'trckable_script' );
	delete_transient( 'trckable_stats' );
}

if ( is_multisite() ) {
	foreach ( get_sites( array( 'fields' => 'ids' ) ) as $trckable_blog_id ) {
		switch_to_blog( $trckable_blog_id );
		trckable_uninstall_site();
		restore_current_blog();
	}
} else {
	trckable_uninstall_site();
}
