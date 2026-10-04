<?php
/**
 * Markup the settings page and the dashboard widget share: the ghost, the
 * line icons, the status pill, the sparkline and the numbers.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Small pieces of markup. Everything printed here is built from constants in
 * this file or escaped on the way out.
 */
class Trckable_View {

	/**
	 * The ghost as a monochrome menu icon (WordPress colours it to fit the menu).
	 */
	const MENU_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHBhdGggZmlsbD0iYmxhY2siIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTEyIDMwYTIwIDIwIDAgMCAxIDQwIDB2MjJsLTUtMy41LTUgMy41LTUtMy41LTUgMy41LTUtMy41LTUgMy41LTUtMy41LTUgMy41ek0yNS41IDI1LjRhMy42IDMuNiAwIDEgMCAwIDcuMiAzLjYgMy42IDAgMSAwIDAtNy4yek0zOC41IDI1LjRhMy42IDMuNiAwIDEgMCAwIDcuMiAzLjYgMy42IDAgMSAwIDAtNy4yeiIvPjwvc3ZnPg==';

	/**
	 * The trckable ghost, from the one logo: the body, the eyes and the chart line it peeks over.
	 *
	 * @return void
	 */
	public static function mark() {
		?>
		<svg class="trk-mark" viewBox="0 0 64 64" width="36" height="36" aria-hidden="true" focusable="false">
			<path fill="#b8ff3c" d="M12 30a20 20 0 0 1 40 0v22l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5z"/>
			<circle cx="25.5" cy="29" r="3.6" fill="#0b0d10"/><circle cx="38.5" cy="29" r="3.6" fill="#0b0d10"/>
			<circle cx="26.6" cy="27.8" r="1.1" fill="#b8ff3c"/><circle cx="39.6" cy="27.8" r="1.1" fill="#b8ff3c"/>
			<path class="trk-mark-edge" d="M5 47l12-6 9 4 12-9 9 3 12-12" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
			<path class="trk-mark-line" d="M5 47l12-6 9 4 12-9 9 3 12-12" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		<?php
	}

	/**
	 * The name, in the logo's own type: bold "trck", light "able".
	 *
	 * @return void
	 */
	public static function name() {
		echo '<span class="trk-name" aria-label="trckable">trck<span>able</span></span>';
	}

	/**
	 * A line icon (24 px grid, 2 px stroke).
	 *
	 * @param string $name Which one.
	 * @return void
	 */
	public static function icon( $name ) {
		$paths = array(
			'link'     => '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
			'server'   => '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
			'cloud'    => '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
			'eye'      => '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
			'eye-off'  => '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
			'target'   => '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
			'layout'   => '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
			'help'     => '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
			'check'    => '<path d="M20 6 9 17l-5-5"/>',
			'x'        => '<path d="M18 6 6 18M6 6l12 12"/>',
			'copy'     => '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
			'external' => '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
			'code'     => '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
		);
		if ( isset( $paths[ $name ] ) ) {
			// Constants above, no input.
			echo '<svg class="trk-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . $paths[ $name ] . '</svg>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
	}

	/**
	 * The status pill and the name of the server beside it.
	 *
	 * @param string $state off, added, waiting or live.
	 * @param array  $o     Settings.
	 * @return void
	 */
	public static function pill( $state, $o ) {
		printf(
			'<span class="trk-pill" data-state="%1$s" role="status"><i aria-hidden="true"></i><span>%2$s</span></span>',
			esc_attr( $state ),
			esc_html( Trckable_Stats::label( $state ) )
		);
		printf(
			'<span class="trk-server" title="%1$s">%2$s</span>',
			esc_attr__( 'Where your numbers are', 'trckable' ),
			esc_html( Trckable_Options::server_label( $o ) )
		);
	}

	/**
	 * The two paths of a sparkline in a 100 by 30 box: the line, and the area under it.
	 *
	 * @param int[] $series Values, oldest first.
	 * @return string[] line, area.
	 */
	public static function spark_paths( $series ) {
		$max   = max( 1, max( $series ) );
		$count = count( $series );
		$line  = '';
		foreach ( array_values( $series ) as $i => $v ) {
			$x     = $count > 1 ? 100 * $i / ( $count - 1 ) : 0;
			$y     = 27 - 24 * $v / $max;
			$line .= ( 0 === $i ? 'M' : 'L' ) . round( $x, 1 ) . ' ' . round( $y, 1 );
		}
		return array( $line, $line . 'L100 30L0 30Z' );
	}

	/**
	 * The numbers: online now with its pulse, visitors today, seven days as a sparkline.
	 *
	 * @param array $stats online, today, series.
	 * @return void
	 */
	public static function numbers( $stats ) {
		list( $line, $area ) = self::spark_paths( $stats['series'] );
		?>
		<div class="trk-numbers">
			<div class="trk-num"><span class="trk-pulse" aria-hidden="true"></span><b data-n="online"><?php echo esc_html( number_format_i18n( $stats['online'] ) ); ?></b><small><?php esc_html_e( 'online now', 'trckable' ); ?></small></div>
			<div class="trk-num"><b data-n="today"><?php echo esc_html( number_format_i18n( $stats['today'] ) ); ?></b><small><?php esc_html_e( 'visitors today', 'trckable' ); ?></small></div>
		</div>
		<svg class="trk-spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="<?php esc_attr_e( 'Visitors, last 7 days', 'trckable' ); ?>">
			<path class="trk-spark-area" d="<?php echo esc_attr( $area ); ?>"/>
			<path class="trk-spark-line" d="<?php echo esc_attr( $line ); ?>" vector-effect="non-scaling-stroke"/>
		</svg>
		<?php
	}

	/**
	 * The top pages of the week.
	 *
	 * @param array $pages Rows of path and visitors.
	 * @return void
	 */
	public static function pages( $pages ) {
		echo '<ol class="trk-pages" data-pages>';
		foreach ( $pages as $row ) {
			printf( '<li><span>%1$s</span><b>%2$s</b></li>', esc_html( $row['path'] ), esc_html( number_format_i18n( $row['visitors'] ) ) );
		}
		echo '</ol>';
	}

	/**
	 * Sample numbers for a preview without an API key.
	 *
	 * @return array
	 */
	public static function sample() {
		return array(
			'online' => 3,
			'today'  => 128,
			'week'   => 691,
			'series' => array( 64, 88, 71, 97, 110, 92, 128 ),
			'pages'  => array(
				array(
					'path'     => '/',
					'visitors' => 61,
				),
				array(
					'path'     => '/pricing',
					'visitors' => 34,
				),
				array(
					'path'     => '/blog/hello-world',
					'visitors' => 19,
				),
			),
		);
	}
}
