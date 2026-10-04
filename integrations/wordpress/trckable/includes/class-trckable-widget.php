<?php
/**
 * The dashboard widget: who is online now, visitors today and the last seven days.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * The same numbers and look as the preview on the trckable page.
 */
class Trckable_Widget {

	/**
	 * Hooks the widget in.
	 *
	 * @return void
	 */
	public static function init() {
		add_action( 'wp_dashboard_setup', array( __CLASS__, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'style' ) );
	}

	/**
	 * Whether the current person gets the widget.
	 *
	 * @return bool
	 */
	private static function wanted() {
		return current_user_can( 'manage_options' ) && Trckable_Options::configured( Trckable_Options::get() );
	}

	/**
	 * Loads the style on the dashboard.
	 *
	 * @param string $hook The admin page.
	 * @return void
	 */
	public static function style( $hook ) {
		if ( 'index.php' === $hook && self::wanted() ) {
			Trckable_Page::style();
		}
	}

	/**
	 * Adds the widget for people who manage the site.
	 *
	 * @return void
	 */
	public static function register() {
		if ( self::wanted() ) {
			wp_add_dashboard_widget( 'trckable_widget', __( 'trckable', 'trckable' ), array( __CLASS__, 'render' ) );
		}
	}

	/**
	 * Draws the widget.
	 *
	 * @return void
	 */
	public static function render() {
		$o     = Trckable_Options::get();
		$stats = Trckable_Stats::get( $o );
		echo '<div class="trk-app trk-widget" data-state="' . esc_attr( Trckable_Stats::state( $o, $stats ) ) . '">';
		if ( ! Trckable_Options::valid_key( $o['api_key'] ) ) {
			printf( '<p><a href="%1$s">%2$s</a></p>', esc_url( Trckable_Settings::url() ), esc_html__( 'Add a read-only API key', 'trckable' ) );
		} elseif ( is_wp_error( $stats ) ) {
			$status = (int) $stats->get_error_data()['status'];
			echo '<p>' . esc_html( in_array( $status, array( 401, 403 ), true ) ? __( 'The API key is not accepted.', 'trckable' ) : __( 'trckable did not answer.', 'trckable' ) ) . '</p>';
		} else {
			Trckable_View::numbers( $stats );
			Trckable_View::pages( $stats['pages'] );
		}
		printf(
			'<p class="trk-widget-foot"><a class="trk-btn trk-btn-lime" href="%1$s" target="_blank" rel="noopener">%2$s</a></p></div>',
			esc_url( Trckable_Options::server_url( $o ) ),
			esc_html__( 'Open trckable', 'trckable' )
		);
	}
}
