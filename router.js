/* --------------------------------------
 * Shopify app authenticate route
 * --------------------------------------
 * This route takes the passed code and shop params returned from shopify authorization redirect
 * and calls the generateAccessToken method to generate and save a permanent access token
 * If successfull, then we log the shopify user in
 * ------------------------------------*/
Router.route('shopifyAuthenticate', {
    path: '/shopify/authenticate',

    onBeforeAction: function() {

        var params = this.params.query;

        // Check first that we have all of the required shopify params
        if (!params.hmac || !params.signature || !params.shop || !params.code) {

            // Don't have all required params, so show error
            handleError('Shopify parameters missing, cannot authenticate');

        } else {
            // We have the required params, so we can continue
            this.next();
        }
    },

    action: function() {

        var code = this.params.query.code;
        var shop = this.params.query.shop;
        var nonce = this.params.query.state;
        var that = this;

        // Validate signature to ensure its from Shopify
        Meteor.call('shopify/validateAuthCode', this.params.query, function(error, result) {

            // Successful signature validation
            if (result === true) {

                console.log('Shopify app: Shopify authorisation successfull');
                console.log('Shopify app: Requesting permanent access token...');

                // Generate permanent access token
                Meteor.call('shopify/oauth/generateAccessToken', code, shop, function(error, result) {

                    // Generated access token successfully
                    if (result) {

                        console.log('Shopify app: Permanent access token generated');
                        Router.go('dashboard');

                        // Error generating access token
                    } else if (error) {
                        console.log(error);
                        handleError('Cannot generate access token, invalid OAuth request');
                    }
                });

                // Signature validation error
            } else {
                handleError('Cannot validate Shopify OAuth signature. There maybe a security issue.');
            }
        });
    }
});