<?php
/**
 * The trckable page: a branded header, a first-run card, settings as cards and a
 * preview of what you will see.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Drawing the page; saving is Trckable_Settings, the live parts are Trckable_Ajax.
 */
class Trckable_Page {

	/**
	 * Hooks the page's own style and script, once we know it is the one being opened.
	 *
	 * @return void
	 */
	public static function prepare() {
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * Loads the style, and on this page the script too. Both are files of the plugin.
	 *
	 * @return void
	 */
	public static function enqueue() {
		self::style();
		wp_enqueue_script( 'trckable-admin', plugins_url( 'admin/trckable-admin.js', TRCKABLE_FILE ), array(), TRCKABLE_VERSION, true );
		wp_localize_script(
			'trckable-admin',
			'trckableAdmin',
			array(
				'ajax'  => admin_url( 'admin-ajax.php' ),
				'nonce' => wp_create_nonce( Trckable_Ajax::NONCE ),
				'cloud' => Trckable_Options::DEFAULT_HOST,
				'tag'   => array(
					'js' => rest_url( Trckable_Proxy::NAMESPACE_ . '/js/' ),
					'e'  => rest_url( Trckable_Proxy::NAMESPACE_ . '/e' ),
				),
				'poll'  => 4000,
				'keyed' => Trckable_Options::valid_key( Trckable_Options::get()['api_key'] ),
				'i18n'  => array(
					'checking'       => __( 'Checking…', 'trckable' ),
					'needSite'       => __( 'Paste your site ID first.', 'trckable' ),
					'badSite'        => __( 'The site ID looks like tkb_ followed by letters and digits.', 'trckable' ),
					'needHost'       => __( 'The address needs https (http works for localhost).', 'trckable' ),
					'failed'         => __( 'Could not check. Try again.', 'trckable' ),
					'copied'         => __( 'Copied', 'trckable' ),
					'copy'           => __( 'Copy', 'trckable' ),
					'show'           => __( 'Show', 'trckable' ),
					'hide'           => __( 'Hide', 'trckable' ),
					'waiting'        => __( 'Waiting for the first visit…', 'trckable' ),
					'first'          => __( 'The first visit arrived. You are counting.', 'trckable' ),
					'noKey'          => __( 'Add a read-only API key to watch it arrive here, or open trckable.', 'trckable' ),
					'keySaved'       => __( 'Saved. Waiting for the first visit…', 'trckable' ),
					'keyBad'         => __( 'That key has letters, digits, _ and - only.', 'trckable' ),
					'sample'         => __( 'Sample data', 'trckable' ),
					'yours'          => __( 'Your numbers', 'trckable' ),
					'tagPlaceholder' => 'tkb_…',
				),
			)
		);
	}

	/**
	 * The style alone, for the dashboard widget.
	 *
	 * @return void
	 */
	public static function style() {
		wp_enqueue_style( 'trckable-admin', plugins_url( 'admin/trckable-admin.css', TRCKABLE_FILE ), array(), TRCKABLE_VERSION );
	}

	/**
	 * Draws the page.
	 *
	 * @return void
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$o     = Trckable_Options::get();
		$stats = Trckable_Stats::get( $o );
		$state = Trckable_Stats::state( $o, $stats );
		// Only chooses what to show; nothing is changed by it.
		$full  = isset( $_GET['form'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$first = ( '' === $o['site'] || $o['onboarding'] ) && ! $full;
		$saved = isset( $_GET['settings-updated'] ) && ! count( get_settings_errors( Trckable_Settings::PAGE ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		?>
		<div class="wrap trk-wrap">
			<h1 class="screen-reader-text"><?php esc_html_e( 'trckable', 'trckable' ); ?></h1>
			<?php settings_errors( Trckable_Settings::PAGE ); ?>
			<div class="trk-app" data-state="<?php echo esc_attr( $state ); ?>">
				<header class="trk-head">
					<span class="trk-brand"><?php Trckable_View::mark(); ?><?php Trckable_View::name(); ?></span>
					<span class="trk-head-status"><?php Trckable_View::pill( $state, $o ); ?></span>
					<?php if ( Trckable_Options::configured( $o ) ) : ?>
						<a class="trk-btn trk-btn-lime" href="<?php echo esc_url( Trckable_Options::server_url( $o ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Open trckable', 'trckable' ); ?> <?php Trckable_View::icon( 'external' ); ?></a>
					<?php endif; ?>
				</header>
				<?php
				if ( $first ) {
					Trckable_Page_Parts::onboarding( $o );
				} else {
					Trckable_Page_Parts::form( $o, $stats );
				}
				?>
				<div class="trk-toast" role="status" aria-live="polite" data-saved="<?php echo $saved ? '1' : '0'; ?>"><?php Trckable_View::icon( 'check' ); ?> <?php esc_html_e( 'Saved', 'trckable' ); ?></div>
			</div>
		</div>
		<?php
	}
}
