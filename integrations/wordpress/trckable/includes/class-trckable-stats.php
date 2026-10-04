<?php
/**
 * The numbers the settings page and the dashboard widget show, from the
 * read-only API: who is online, visitors today, the last seven days, top pages.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * One report, kept for a minute.
 */
class Trckable_Stats {

	const KEY = 'trckable_stats';

	/**
	 * Reads the numbers, from the kept answer when it is younger than $ttl seconds.
	 *
	 * @param array $o   Settings.
	 * @param int   $ttl How old a kept answer may be.
	 * @return array|WP_Error online, today, week, series (seven days, oldest first), pages.
	 */
	public static function get( $o, $ttl = MINUTE_IN_SECONDS ) {
		$host = Trckable_Options::server_url( $o );
		if ( ! Trckable_Options::configured( $o ) || ! Trckable_Options::valid_key( $o['api_key'] ) ) {
			return new WP_Error( 'trckable_nokey', '', array( 'status' => 0 ) );
		}
		$stamp = md5( $host . '|' . $o['site'] . '|' . $o['api_key'] );
		$kept  = get_transient( self::KEY );
		if ( is_array( $kept ) && $kept['stamp'] === $stamp && time() - $kept['at'] < $ttl ) {
			return isset( $kept['stats'] ) ? $kept['stats'] : new WP_Error( 'trckable_report', '', array( 'status' => $kept['error'] ) );
		}
		$zone = wp_timezone_string();
		$tz   = ( false !== strpos( $zone, '/' ) || 'UTC' === $zone ) ? $zone : 'UTC';
		$end  = new DateTimeImmutable( 'now', new DateTimeZone( $tz ) );
		$res  = wp_remote_get(
			add_query_arg(
				array(
					'from'   => $end->modify( '-6 days' )->format( 'Y-m-d' ),
					'to'     => $end->format( 'Y-m-d' ),
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
			set_transient(
				self::KEY,
				array(
					'stamp' => $stamp,
					'at'    => time(),
					'error' => $code,
				),
				MINUTE_IN_SECONDS
			);
			return new WP_Error( 'trckable_report', '', array( 'status' => $code ) );
		}
		$series = array();
		foreach ( isset( $data['current']['series'] ) && is_array( $data['current']['series'] ) ? $data['current']['series'] : array() as $point ) {
			$series[] = isset( $point['visitors'] ) ? (int) $point['visitors'] : 0;
		}
		$series = array_slice( array_pad( $series, -7, 0 ), -7 );
		$pages  = array();
		foreach ( isset( $data['current']['dims']['page'] ) && is_array( $data['current']['dims']['page'] ) ? array_slice( $data['current']['dims']['page'], 0, 3 ) : array() as $row ) {
			if ( isset( $row['value'], $row['visitors'] ) ) {
				$pages[] = array(
					'path'     => sanitize_text_field( (string) $row['value'] ),
					'visitors' => (int) $row['visitors'],
				);
			}
		}
		$stats = array(
			'online' => isset( $data['online'] ) ? (int) $data['online'] : 0,
			'today'  => (int) end( $series ),
			'week'   => (int) $data['current']['kpis']['visitors'],
			'series' => $series,
			'pages'  => $pages,
		);
		set_transient(
			self::KEY,
			array(
				'stamp' => $stamp,
				'at'    => time(),
				'stats' => $stats,
			),
			MINUTE_IN_SECONDS
		);
		return $stats;
	}

	/**
	 * Where the connection stands. With no API key nothing can be known beyond
	 * the script being added.
	 *
	 * @param array          $o     Settings.
	 * @param array|WP_Error $stats What get() answered.
	 * @return string off, added, waiting or live.
	 */
	public static function state( $o, $stats ) {
		if ( ! Trckable_Options::configured( $o ) ) {
			return 'off';
		}
		if ( ! Trckable_Options::valid_key( $o['api_key'] ) ) {
			return 'added';
		}
		if ( is_wp_error( $stats ) ) {
			return 'off';
		}
		return ( $stats['week'] > 0 || $stats['online'] > 0 ) ? 'live' : 'waiting';
	}

	/**
	 * The words of a state.
	 *
	 * @param string $state A state.
	 * @return string
	 */
	public static function label( $state ) {
		$labels = array(
			'live'    => __( 'Connected · counting', 'trckable' ),
			'waiting' => __( 'Waiting for the first visit', 'trckable' ),
			'added'   => __( 'Script added', 'trckable' ),
			'off'     => __( 'Not connected', 'trckable' ),
		);
		return $labels[ $state ];
	}
}
