package payments

// What the owner reads when connecting a Paddle key fails: plain words, and
// never any part of the key.
const (
	msgPaddleRejected    = "Paddle didn't accept this key."
	msgPaddleUnreachable = "Couldn't reach Paddle. Try again in a minute."
	msgPaddleMissingOne  = "This Paddle key is missing a permission: %s."
	msgPaddleMissingMany = "This Paddle key is missing permissions: %s."
)

// The permissions the key needs (https://developer.paddle.com/api-reference/about/permissions):
// the webhook endpoint is created with the first, and reconciliation reads
// transactions and adjustments with the others.
const (
	permNotificationWrite = "notification_setting.write"
	permTransactionRead   = "transaction.read"
	permAdjustmentRead    = "adjustment.read"
)
