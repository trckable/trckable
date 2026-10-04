<?php
/**
 * The parts of the trckable page: the first-run card, the settings cards and the preview.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Markup only. Every value is escaped where it is printed.
 */
class Trckable_Page_Parts {

	/**
	 * A small help mark with a tooltip that shows on hover and on focus.
	 *
	 * @param string $text The tooltip.
	 * @return void
	 */
	private static function tip( $text ) {
		printf( '<button type="button" class="trk-tip" data-tip="%1$s" aria-label="%1$s">', esc_attr( $text ) );
		Trckable_View::icon( 'help' );
		echo '</button>';
	}

	/**
	 * A switch: a checkbox that looks like one, and works with the keyboard.
	 *
	 * @param string $name    Setting name.
	 * @param string $label   Short label.
	 * @param bool   $checked Whether it is on.
	 * @param string $tip     Longer words for the tooltip.
	 * @return void
	 */
	private static function toggle( $name, $label, $checked, $tip = '' ) {
		printf(
			'<div class="trk-row"><label class="trk-switch" for="trckable_%1$s"><span>%4$s</span><input type="checkbox" role="switch" id="trckable_%1$s" name="%2$s[%1$s]" value="1" %3$s /><i class="trk-track" aria-hidden="true"></i></label>',
			esc_attr( $name ),
			esc_attr( Trckable_Options::NAME ),
			checked( $checked, true, false ),
			esc_html( $label )
		);
		if ( '' !== $tip ) {
			self::tip( $tip );
		}
		echo '</div>';
	}

	/**
	 * A text field with its label.
	 *
	 * @param string $name  Setting name.
	 * @param string $label Short label.
	 * @param string $value Current value.
	 * @param string $extra More attributes, written in this file.
	 * @param string $tip   Tooltip, optional.
	 * @return void
	 */
	private static function field( $name, $label, $value, $extra = '', $tip = '' ) {
		printf( '<div class="trk-field"><div class="trk-label"><label for="trckable_%1$s">%2$s</label>', esc_attr( $name ), esc_html( $label ) );
		if ( '' !== $tip ) {
			self::tip( $tip );
		}
		printf(
			'</div><input type="text" id="trckable_%1$s" name="%2$s[%1$s]" value="%3$s" autocomplete="off" spellcheck="false" %4$s /></div>',
			esc_attr( $name ),
			esc_attr( Trckable_Options::NAME ),
			esc_attr( $value ),
			$extra // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- literals of this file.
		);
	}

	/**
	 * A secret: a password field with a show and hide button.
	 *
	 * @param string $name        Setting name.
	 * @param string $label       Short label.
	 * @param string $value       Current value.
	 * @param string $placeholder What a key looks like.
	 * @param string $tip         Tooltip.
	 * @return void
	 */
	private static function secret( $name, $label, $value, $placeholder, $tip ) {
		printf( '<div class="trk-field"><div class="trk-label"><label for="trckable_%1$s">%2$s</label>', esc_attr( $name ), esc_html( $label ) );
		self::tip( $tip );
		printf(
			'</div><div class="trk-key"><input type="password" id="trckable_%1$s" name="%2$s[%1$s]" value="%3$s" placeholder="%4$s" autocomplete="off" spellcheck="false" /><button type="button" class="trk-reveal" data-reveal="trckable_%1$s" aria-pressed="false" aria-label="%5$s">',
			esc_attr( $name ),
			esc_attr( Trckable_Options::NAME ),
			esc_attr( $value ),
			esc_attr( $placeholder ),
			esc_attr__( 'Show', 'trckable' )
		);
		Trckable_View::icon( 'eye' );
		echo '</button></div></div>';
	}

	/**
	 * Opens a card.
	 *
	 * @param string $icon  Icon name.
	 * @param string $title Short title.
	 * @param string $tip   Tooltip, optional.
	 * @return void
	 */
	private static function open( $icon, $title, $tip = '' ) {
		echo '<section class="trk-card"><h2 class="trk-card-title"><span class="trk-card-ico">';
		Trckable_View::icon( $icon );
		echo '</span>' . esc_html( $title );
		if ( '' !== $tip ) {
			self::tip( $tip );
		}
		echo '</h2><div class="trk-card-body">';
	}

	/**
	 * Closes a card.
	 *
	 * @return void
	 */
	private static function close() {
		echo '</div></section>';
	}

	/**
	 * The check button and the place its answer appears, with its small animation.
	 *
	 * @return void
	 */
	private static function check() {
		echo '<div class="trk-checkrow"><button type="button" class="trk-btn trk-btn-ghost" data-check>';
		Trckable_View::icon( 'link' );
		echo ' ' . esc_html__( 'Check connection', 'trckable' ) . '</button><span class="trk-check" data-state="idle" role="status" aria-live="polite"><i class="trk-spin" aria-hidden="true"></i>';
		Trckable_View::icon( 'check' );
		Trckable_View::icon( 'x' );
		echo '<span class="trk-check-msg"></span></span></div>';
	}

	/**
	 * The choice of where trckable runs: Cloud, or a server of your own with its address.
	 *
	 * @param array $o Settings.
	 * @return void
	 */
	private static function server_choice( $o ) {
		$name = Trckable_Options::NAME . '[server]';
		$own  = 'own' === $o['server'];
		echo '<div class="trk-choices" role="radiogroup" aria-label="' . esc_attr__( 'Where trckable runs', 'trckable' ) . '">';
		foreach ( array(
			'cloud' => array( 'cloud', __( 'trckable Cloud', 'trckable' ), __( 'We run it. No address to enter.', 'trckable' ) ),
			'own'   => array( 'server', __( 'My own server', 'trckable' ), __( 'Self-hosted. You enter its address.', 'trckable' ) ),
		) as $value => $choice ) {
			printf(
				'<input type="radio" class="trk-sr" id="trk-server-%1$s" name="%2$s" value="%1$s" %3$s /><label class="trk-choice" for="trk-server-%1$s"><span class="trk-card-ico">',
				esc_attr( $value ),
				esc_attr( $name ),
				checked( $own, 'own' === $value, false )
			);
			Trckable_View::icon( $choice[0] );
			echo '</span><b>' . esc_html( $choice[1] ) . '</b><small>' . esc_html( $choice[2] ) . '</small></label>';
		}
		echo '<div class="trk-own"><div class="trk-field"><label for="trckable_host">' . esc_html__( 'Address', 'trckable' ) . '</label>';
		printf(
			'<input type="url" id="trckable_host" name="%1$s[host]" value="%2$s" placeholder="https://stats.example.com" autocomplete="off" spellcheck="false" /></div></div></div>',
			esc_attr( Trckable_Options::NAME ),
			esc_attr( $o['host'] )
		);
	}

	/**
	 * The script tag the plugin adds, as text.
	 *
	 * @param array $o Settings.
	 * @return string
	 */
	private static function tag_text( $o ) {
		$site  = '' === $o['site'] ? 'tkb_…' : $o['site'];
		$proxy = Trckable_Options::proxy_ready( $o );
		$src   = $proxy ? rest_url( Trckable_Proxy::NAMESPACE_ . '/js/' . $site . '.js' ) : Trckable_Options::server_url( $o ) . '/js/' . $site . '.js';
		$tag   = '<script data-site="' . $site . '"' . ( $o['cookieless'] ? ' data-cookieless' : '' );
		$tag  .= $proxy ? ' data-api="' . rest_url( Trckable_Proxy::NAMESPACE_ . '/e' ) . '"' : '';
		return $tag . ' data-wp-strategy="defer" defer id="trckable-js" src="' . $src . '"></script>';
	}

	/**
	 * The script tag in a box, with a copy button.
	 *
	 * @param array $o Settings.
	 * @return void
	 */
	private static function tag_box( $o ) {
		echo '<div class="trk-tagbox"><pre><code id="trk-tag">' . esc_html( self::tag_text( $o ) ) . '</code></pre><button type="button" class="trk-btn trk-btn-ghost trk-copy" data-copy="trk-tag">';
		Trckable_View::icon( 'copy' );
		echo ' <span>' . esc_html__( 'Copy', 'trckable' ) . '</span></button></div>';
	}

	/**
	 * The first-run card: where it runs, the site ID, the first visit.
	 *
	 * @param array $o Settings.
	 * @return void
	 */
	public static function onboarding( $o ) {
		$steps = array(
			1 => __( 'Where does your trckable run?', 'trckable' ),
			2 => __( 'Paste your site ID', 'trckable' ),
			3 => __( 'Visit your site', 'trckable' ),
		);
		$now   = '' === $o['site'] ? 1 : 3;
		?>
		<section class="trk-card trk-onboard" id="trk-onboard" data-step="<?php echo (int) $now; ?>">
			<h2 class="trk-onboard-title"><?php esc_html_e( 'Start counting in three steps', 'trckable' ); ?></h2>
			<ol class="trk-steps">
				<?php foreach ( $steps as $n => $title ) : ?>
					<li class="trk-step" data-n="<?php echo (int) $n; ?>">
						<span class="trk-step-n"><span><?php echo (int) $n; ?></span><?php Trckable_View::icon( 'check' ); ?></span>
						<div class="trk-step-main">
							<h3><?php echo esc_html( $title ); ?></h3>
							<div class="trk-step-body">
								<?php
								if ( 1 === $n ) {
									self::server_choice( $o );
									self::check();
									echo '<button type="button" class="trk-btn trk-btn-lime" data-next="1">' . esc_html__( 'Continue', 'trckable' ) . '</button>';
								} elseif ( 2 === $n ) {
									self::field( 'site', __( 'Site ID', 'trckable' ), $o['site'], 'placeholder="tkb_a1b2c3d4e5f6" pattern="tkb_[A-Za-z0-9]{4,64}"', __( 'In trckable: Settings, Install. It starts with tkb_.', 'trckable' ) );
									echo '<p class="trk-help"><a href="' . esc_url( Trckable_Options::server_url( $o ) ) . '" target="_blank" rel="noopener" data-open-trckable>' . esc_html__( 'Where do I find it?', 'trckable' ) . '</a></p>';
									self::tag_box( $o );
									self::check();
								} else {
									echo '<a class="trk-btn trk-btn-lime" href="' . esc_url( home_url( '/' ) ) . '" target="_blank" rel="noopener" data-visit>' . esc_html__( 'Visit your site', 'trckable' ) . ' ';
									Trckable_View::icon( 'external' );
									echo '</a> <span class="trk-note">' . esc_html__( 'In a private window: you are logged in, so your own visit is not counted.', 'trckable' ) . '</span>';
									echo '<div class="trk-wait" data-wait><span class="trk-pulse" aria-hidden="true"></span><span data-wait-msg>' . esc_html__( 'Waiting for the first visit…', 'trckable' ) . '</span></div>';
									self::secret( 'api_key', __( 'Read-only API key (optional)', 'trckable' ), $o['api_key'], 'tkb_live_…', __( 'With a key this page sees the first visit arrive. In trckable: your account, API keys.', 'trckable' ) );
									echo '<button type="button" class="trk-btn trk-btn-ghost" data-save-key>' . esc_html__( 'Save key', 'trckable' ) . '</button>';
									echo '<a class="trk-btn trk-btn-lime trk-done-btn" href="' . esc_url( add_query_arg( 'form', '1', Trckable_Settings::url() ) ) . '" data-finish>' . esc_html__( 'Open settings', 'trckable' ) . '</a>';
								}
								?>
							</div>
						</div>
					</li>
				<?php endforeach; ?>
			</ol>
			<p class="trk-skip"><a href="<?php echo esc_url( add_query_arg( 'form', '1', Trckable_Settings::url() ) ); ?>" data-finish><?php esc_html_e( 'Skip, show all settings', 'trckable' ); ?></a></p>
		</section>
		<?php
	}

	/**
	 * The settings as cards on the left, the preview on the right.
	 *
	 * @param array          $o     Settings.
	 * @param array|WP_Error $stats The numbers.
	 * @return void
	 */
	public static function form( $o, $stats ) {
		?>
		<div class="trk-layout">
			<form method="post" action="options.php" class="trk-form" id="trk-form">
				<?php
				settings_fields( Trckable_Settings::PAGE );

				self::open( 'link', __( 'Site', 'trckable' ) );
				self::field( 'site', __( 'Site ID', 'trckable' ), $o['site'], 'placeholder="tkb_a1b2c3d4e5f6" pattern="tkb_[A-Za-z0-9]{4,64}"', __( 'In trckable: Settings, Install. It starts with tkb_.', 'trckable' ) );
				self::close();

				self::open( 'server', __( 'Server', 'trckable' ), __( 'Where your numbers live. Cloud needs nothing; a server of your own needs its https address.', 'trckable' ) );
				self::server_choice( $o );
				self::check();
				self::close();

				self::open( 'eye', __( 'Counting', 'trckable' ) );
				self::toggle( 'cookieless', __( 'Cookieless', 'trckable' ), ! empty( $o['cookieless'] ), __( 'Visitors are counted without storing anything in their browser.', 'trckable' ) );
				self::toggle( 'exclude_staff', __( 'Skip admins and editors', 'trckable' ), ! empty( $o['exclude_staff'] ), __( 'Logged-in admins and editors are left out of the numbers.', 'trckable' ) );
				echo '<fieldset class="trk-roles"><legend>' . esc_html__( 'Skip roles', 'trckable' ) . '</legend>';
				foreach ( wp_roles()->get_names() as $role => $name ) {
					printf(
						'<label class="trk-role"><input type="checkbox" class="trk-sr" name="%1$s[exclude_roles][]" value="%2$s" %3$s /><span>%4$s</span></label>',
						esc_attr( Trckable_Options::NAME ),
						esc_attr( $role ),
						checked( in_array( $role, (array) $o['exclude_roles'], true ), true, false ),
						esc_html( translate_user_role( $name ) )
					);
				}
				echo '</fieldset>';
				self::close();

				self::open( 'target', __( 'Accuracy', 'trckable' ) );
				self::toggle( 'proxy', __( 'Through this site', 'trckable' ), ! empty( $o['proxy'] ), __( 'Blockers do not see a third-party address, and visitors keep their own country. Needs the proxy key.', 'trckable' ) );
				self::secret( 'proxy_key', __( 'Proxy key', 'trckable' ), $o['proxy_key'], 'tkb_px_…', __( 'In trckable: Settings, Install.', 'trckable' ) );
				self::close();

				self::open( 'layout', __( 'Dashboard widget', 'trckable' ) );
				self::secret( 'api_key', __( 'API key', 'trckable' ), $o['api_key'], 'tkb_live_…', __( 'Optional. A read-only key: it shows your numbers here and on the WordPress dashboard.', 'trckable' ) );
				self::close();
				?>
				<div class="trk-bar"><button type="submit" name="submit" id="submit" class="trk-btn trk-btn-lime"><?php esc_html_e( 'Save changes', 'trckable' ); ?></button></div>
			</form>
			<?php self::preview( $o, $stats ); ?>
		</div>
		<?php
	}

	/**
	 * A mini version of what trckable shows, with the chips that follow the switches
	 * and the script tag that will be added.
	 *
	 * @param array          $o     Settings.
	 * @param array|WP_Error $stats The numbers.
	 * @return void
	 */
	private static function preview( $o, $stats ) {
		$real = ! is_wp_error( $stats );
		$data = $real ? $stats : Trckable_View::sample();
		?>
		<aside class="trk-preview" aria-label="<?php esc_attr_e( 'Preview', 'trckable' ); ?>">
			<section class="trk-card trk-prev" data-real="<?php echo $real ? '1' : '0'; ?>">
				<h2 class="trk-card-title"><span class="trk-card-ico"><?php Trckable_View::icon( 'eye' ); ?></span><?php esc_html_e( 'Preview', 'trckable' ); ?>
					<span class="trk-sample" data-sample><?php echo $real ? esc_html__( 'Your numbers', 'trckable' ) : esc_html__( 'Sample data', 'trckable' ); ?></span></h2>
				<div class="trk-card-body">
					<?php
					Trckable_View::numbers( $data );
					Trckable_View::pages( $data['pages'] );
					?>
					<div class="trk-chips">
						<span class="trk-chip-s" data-chip="cookieless" data-on="<?php esc_attr_e( 'cookieless ✓', 'trckable' ); ?>" data-off="<?php esc_attr_e( 'cookies on', 'trckable' ); ?>" data-active="<?php echo $o['cookieless'] ? '1' : '0'; ?>"><?php echo $o['cookieless'] ? esc_html__( 'cookieless ✓', 'trckable' ) : esc_html__( 'cookies on', 'trckable' ); ?></span>
						<span class="trk-chip-s" data-chip="staff" data-on="<?php esc_attr_e( 'admins not counted', 'trckable' ); ?>" data-off="<?php esc_attr_e( 'admins counted', 'trckable' ); ?>" data-active="<?php echo $o['exclude_staff'] ? '1' : '0'; ?>"><?php echo $o['exclude_staff'] ? esc_html__( 'admins not counted', 'trckable' ) : esc_html__( 'admins counted', 'trckable' ); ?></span>
					</div>
					<p class="trk-hint" data-hint<?php echo $real ? ' hidden' : ''; ?>><?php esc_html_e( 'Connect to see yours: add a read-only API key under Dashboard widget.', 'trckable' ); ?></p>
				</div>
			</section>
			<section class="trk-card">
				<h2 class="trk-card-title"><span class="trk-card-ico"><?php Trckable_View::icon( 'code' ); ?></span><?php esc_html_e( 'The tag we add', 'trckable' ); ?></h2>
				<div class="trk-card-body"><?php self::tag_box( $o ); ?></div>
			</section>
		</aside>
		<?php
	}
}
