ShopifyApi = {
    options: {}
};

/* --------------------------------------
 * Shopify api init function
 * --------------------------------------
 * This function sets up the shopify api options and detects the shopify shop to use the app
 * ------------------------------------*/
ShopifyApi.init = function (options) {

    check(options, Object);

    console.log(ShopifyApi.options);
    // Set passed options
    _.extend(ShopifyApi.options, options);

    console.log(ShopifyApi.options);

    // If the shop option has been manually set in options then return
    if (ShopifyApi.options.shop) return;

    // Otherwise we need to get and set the shop param from url
    let shop = urlParams().shop;

    // Check we have a shop param and set the option
    if (shop) {
        ShopifyApi.options.shop = shop;
    } else {
        handleError('Cannot detect Shopify shop');
    }
};

/* --------------------------------------
 * Shopify app authorization procedure function
 * --------------------------------------
 * Kicks off the shopify app authenication process for logging in
 * We re-authenticate our app everytime we login as recommended by shopify
 * ------------------------------------*/
ShopifyApi.authorizeApp = params => {

    check(params, Object);

    console.log('Shopify app: Authorising app...');

    // Check for required shopify params
    if (!params.hmac || !params.signature || !params.shop) {
        // Show error page as were missing required shopify params
        handleError('Shopify parameters missing, cannot authenticate');
    }

    // Get shop name from shop param
    let shopName = params.shop.replace('.myshopify.com', '');

    let url = `https://${shopName}.myshopify.com/admin/oauth/authorize
        ?client_id=${ShopifyApi.options.apiKey}
        &scope=${ShopifyApi.options.scopes}
        &redirect_uri=${ShopifyApi.options.appUrl}/shopify/authenticate`;

    console.log(url);
    console.log('Shopify app: Sending authorisation request to Shopify...');

    // Do the redirect to shopify for authorisation
    window.location.replace(url);
};

/* --------------------------------------
 * Login check function
 * --------------------------------------
 * Checks to see if a user is logged in, if not then run the shopfiy app OAuth process
 * ------------------------------------*/
ShopifyApi.loginCheck = () => {
    if (!Meteor.userId()) {
        console.log('Shopify app: Not logged in, need to run OAuth process and authorize');
        ShopifyApi.authorizeApp(Router.current().params.query);
    }
};

/* --------------------------------------
 * Login with Shopify function
 * --------------------------------------
 * Log the given userId in, used after the a successful shopify authorisation process
 * ------------------------------------*/
loginWithShopify = userId => {

    check(userId, String);

    console.log('Shopify app: OAuth process completed. Logging in...');

    // create a login request with shopify: true, so our custom loginHandler can handle this request
    let loginRequest = {
        shopify: true,
        userId: userId
    };

    Accounts.callLoginMethod({
        methodArguments: [loginRequest],

        // login success callback
        userCallback: error => {
            if (!error) {
                console.log('Shopify app: Logged in successfully');
                // Route to app index page
                Router.go(ShopifyApi.options.authSuccessRoute);
            } else {
                console.log(error);
            }
        }
    });
};

/* --------------------------------------
 * Client error handling function
 * ------------------------------------*/
handleError = errorMsg => {
    console.error(`Shopify app: ${errorMsg}`);
    throw new Meteor.Error(errorMsg);
}

/* --------------------------------------
 * URL params helper function
 * --------------------------------------
 * Gets the current url query params and returns them as an object
 * ------------------------------------*/
let urlParams = () => {
    let match,
        pl = /\+/g, // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        query = window.location.search.substring(1),
        decode = s => decodeURIComponent(s.replace(pl, " ")),
        params = {};

    while (match = search.exec(query)) {
        params[decode(match[1])] = decode(match[2]);
    }

    return params;
}