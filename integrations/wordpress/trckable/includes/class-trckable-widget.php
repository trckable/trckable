<?php
/**
 * The dashboard widget: visitors today and who is on the site now.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Two numbers from the read-only API, kept for a minute.
 */
class Trckable_Widget {

	const CACHE_FOR = MINUTE_IN_SECONDS;

	/**
	 * Hooks the widget in.
	 *
	 * @return void
	 */
	public static function init() {
		add_action( 'wp_dashboard_setup', array( __CLASS__, 'register' ) );
	}

	/**
	 * Adds the widget for people who manage the site.
	 *
	 * @return void
	 */
	public static function register() {
		if ( ! current_user_can( 'manage_options' ) || ! Trckable_Options::configured( Trckable_Options::get() ) ) {
			return;
		}
		wp_add_dashboard_widget( 'trckable_widget', __( 'trckable', 'trckable' ), array( __CLASS__, 'render' ) );
	}

	/**
	 * Reads today's visitors and the number online. Both come from one report.
	 *
	 * @param array $o Settings.
	 * @return array|WP_Error visitors and online.
	 */
	public static function numbers( $o ) {
		$host  = Trckable_Options::clean_host( $o['host'] );
		$stamp = md5( $host . '|' . $o['site'] . '|' . $o['api_key'] );
		$kept  = get_transient( 'trckable_widget' );
		if ( is_array( $kept ) && isset( $kept['stamp'] ) && $kept['stamp'] === $stamp ) {
			return $kept['numbers'];
		}
		$zone = wp_timezone_string();
		$tz   = ( false !== strpos( $zone, '/' ) || 'UTC' === $zone ) ? $zone : 'UTC';
		$day  = ( new DateTimeImmutable( 'now', new DateTimeZone( $tz ) ) )->format( 'Y-m-d' );
		$res  = wp_remote_get(
			add_query_arg(
				array(
					'from'   => $day,
					'to'     => $day,
					'tz'     => $tz,
					'bucket' => 'day',
				),
				$host . '/api/v1/sites/' . rawurlencode( $o['site'] ) . '/report'
			),
			array(
				'timeout'     => 5,
				'redirection' => 0,
				'headers'     => array( 'Authorization' => 'Bearer ' . $o['api_key'] ),
			)
		);
		$code = is_wp_error( $res ) ? 0 : (int) wp_remote_retrieve_response_code( $res );
		$data = 200 === $code ? json_decode( wp_remote_retrieve_body( $res ), true ) : null;
		if ( ! is_array( $data ) || ! isset( $data['current']['kpis']['visitors'] ) ) {
			$numbers = new WP_Error( 'trckable_report', __( 'No answer.', 'trckable' ), array( 'status' => $code ) );
		} else {
			$numbers = array(
				'visitors' => (int) $data['current']['kpis']['visitors'],
				'online'   => isset( $data['online'] ) ? (int) $data['online'] : 0,
			);
		}
		set_transient( 'trckable_widget', compact( 'stamp', 'numbers' ), self::CACHE_FOR );
		return $numbers;
	}

	/**
	 * Draws the widget.
	 *
	 * @return void
	 */
	public static function render() {
		$o    = Trckable_Options::get();
		$host = Trckable_Options::clean_host( $o['host'] );
		if ( ! Trckable_Options::valid_key( $o['api_key'] ) ) {
			printf(
				'<p><a href="%s">%s</a></p>',
				esc_url( admin_url( 'options-general.php?page=trckable' ) ),
				esc_html__( 'Add a read-only API key', 'trckable' )
			);
			return;
		}
		$n = self::numbers( $o );
		if ( is_wp_error( $n ) ) {
			$status = (int) $n->get_error_data()['status'];
			echo '<p>' . esc_html( in_array( $status, array( 401, 403 ), true ) ? __( 'The API key is not accepted.', 'trckable' ) : __( 'trckable did not answer.', 'trckable' ) ) . '</p>';
		} else {
			printf(
				'<p style="font-size:2em;line-height:1.2;margin:0 0 4px"><strong>%1$s</strong> <span style="font-size:.5em">%2$s</span></p><p style="margin:0"><strong>%3$s</strong> %4$s</p>',
				esc_html( number_format_i18n( $n['visitors'] ) ),
				esc_html__( 'visitors today', 'trckable' ),
				esc_html( number_format_i18n( $n['online'] ) ),
				esc_html__( 'online now', 'trckable' )
			);
		}
		printf(
			'<p><a href="%s" target="_blank" rel="noopener">%s</a></p>',
			esc_url( $host ),
			esc_html__( 'Open trckable', 'trckable' )
		);
	}
}
