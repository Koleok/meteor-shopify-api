// Set-up the package options and api endpoints (SERVER)
ShopifyApi = {
    options: {
        apiKey: Meteor.settings.shopify.apiKey,
        secret: Meteor.settings.shopify.secret,
        scopes: Meteor.settings.shopify.scopes
    }
};

/* --------------------------------------
 * Shopify api init function
 * --------------------------------------
 * This function sets up the shopify api options for the server
 * ------------------------------------*/
ShopifyApi.init = function(options) {
    check(options, Object);

    // Set passed options
    ShopifyApi.options = options;
};

Meteor.startup(function() {

    // Ensure that all the required package options are set, if not then throw an error
    if (!ShopifyApi.options.hasOwnProperty('apiKey') || ShopifyApi.options.apiKey === '') {
        throw new Meteor.Error('400', 'Required apiKey option missing for Shopify API package');
    }
    if (!ShopifyApi.options.hasOwnProperty('secret') || ShopifyApi.options.secret === '') {
        throw new Meteor.Error('400', 'Required secret option missing for Shopify API package');
    }

    // Set up shopify as an oAuth external service
    ServiceConfiguration.configurations.upsert({
        service: 'shopify'
    }, {
        $set: {
            clientId: ShopifyApi.options.apiKey,
            secret: ShopifyApi.options.secret,
        }
    });
});

Meteor.methods({

    /* --------------------------------------
     * Shopify oauth signature validation function
     * --------------------------------------
     * Validates the shopify oauth signature according to:
     * http://docs.shopify.com/api/authentication/oauth
     * ------------------------------------*/
    'shopify/validateSignature': function(params) {

        check(params, Object);

        var hmac = params.hmac;

        // Delete signature and hmac as shopify docs specifies
        delete params.signature;
        delete params.hmac;

        // Create message query string
        var message = serializeObject(params);

        // Do the hmac sha256 encrypting
        var hash = CryptoJS.HmacSHA256(message, ShopifyApi.options.secret).toString();

        // Return true if we have a match, otherwise return false
        return hash === hmac;
    },

    'shopify/oauth/generateAccessToken': function(code, shop) {

        check(code, String);
        check(code, String);

        if (!shop || !code) {
            throw new Meteor.Error('400', 'Shopify app: Cannot generate Shopify access token: shop OR code parameters missing');
        }

        this.unblock();

        var apiKey = ShopifyApi.options.apiKey,
            secret = ShopifyApi.options.secret;

        var url = 'https://' + shop + '/admin/oauth/access_token';
        var data = {
            client_id: apiKey,
            client_secret: secret,
            code: code
        };

        // Request permanent access token from shopfiy
        var result = HTTP.post(url, {
            params: data
        });

        if (result.statusCode === 200) {

            // Save the new access token to user doc
            return Meteor.call('shopify/updateOrCreateUser', shop, result.data.access_token);
        }
    },

    'shopify/updateOrCreateUser': function(shop, accessToken) {

        check(shop, String);
        check(accessToken, String);

        // Get shop name from shop
        var shopName = shop.replace('.myshopify.com', '');

        var serviceData = {
            id: shop,
            accessToken: accessToken,
            shopName: shopName,
            shop: shop
        };

        // Accounts.updateOrCreateUserFromExternalService is a function located in accounts-base/accounts_server.js
        // This function updates or creates a user with the external service (shopify) authentication data specified above.
        return Accounts.updateOrCreateUserFromExternalService('shopify', serviceData);
    },

    'shopify/user': function() {

        // If shop option has been manually set in options then use this shop
        if (ShopifyApi.options.shop != '') {
            var shop = ShopifyApi.options.shop;
            var selector = {
                'services.shopify.shop': shop
            };

            // Otherwise get shop based on currently logged in user
        } else {
            // Get the currently logged in user
            var currentUserId = Meteor.userId();
            var selector = {
                _id: currentUserId
            };
        }

        // Get all user data
        var user = Meteor.users.findOne(selector);

        if (user.services.shopify) {
            return {
                shop: user.services.shopify.shop,
                token: user.services.shopify.accessToken
            }
        } else {
            throw new Meteor.Error('Shopify app: No shopify user could be found');
        }
    },

    'shopify/api/call': function(method, endpoint, params, content) {

        // Support (method, endpoint) argument list
        if (!params && !content) {
            var params = null;
            var content = null;
        }

        var shop = Meteor.call('shopify/user').shop,
            token = Meteor.call('shopify/user').token,
            apiUrl = 'https://' + shop + endpoint;

        if (!shop || !token || !apiUrl) {
            throw new Meteor.Error('400', 'Shopify app: Missing parameter for Shopify API call');
        }

        this.unblock();

        var headers = {
            "X-Shopify-Access-Token": token,
            "content-type": "application/json"
        };

        var options = {
            headers: headers,
            content: content,
            params: params
        };

        try {
            var result = HTTP.call(method, apiUrl, options);
            return result.data;

        } catch (error) {
            // Got a network error, time-out or HTTP error in the 400 or 500 range.
            return error;
        }
    }
});

// Register login handler for shopify embedded app login
Accounts.registerLoginHandler(function(loginRequest) {

    if (!loginRequest.shopify)
        return undefined; // if the login request is not for shopify, don't handle

    return {
        userId: loginRequest.userId
    };
});

var serializeObject = function(object) {
    var string = [];
    for (var param in object)
        if (object.hasOwnProperty(param)) {
            string.push(encodeURIComponent(param) + "=" + encodeURIComponent(object[param]));
        }
    return string.join("&");
};