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
     * Shopify authentication setup methods
     * --------------------------------------
     * Construct auth url with passed parameters
     * ------------------------------------*/
    'shopify/getInstallURL': function(shop) {
        return 'https://' + shop + '.myshopify.com/admin/oauth/authorize?' +
            'client_id=' + Meteor.settings.shopify.apiKey +
            '&scope=' + Meteor.settings.shopify.scopes +
            '&redirect_uri=' + Meteor.settings.shopify.appUrl +
            '&state=' + Meteor.settings.shopify.nonce
    },

    'shopify/getShopifyConfig': function(shop) {
        return {
            appUrl: Meteor.settings.shopify.appUrl,
            shop: shop.shopName,
            apiKey: Meteor.settings.shopify.apiKey,
            scopes: Meteor.settings.shopify.scopes
        }
    },

    'shopify/getPlatformId': function() {
        return Platforms.findOne({
            name: "Shopify"
        })._id;
    },
    /* --------------------------------------
     * Shopify oauth signature validation function
     * --------------------------------------
     * Validates the shopify oauth signature according to:
     * http://docs.shopify.com/api/authentication/oauth
     * ------------------------------------*/
    'shopify/validateAuthCode': function(params) {

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

    'shopify/validateNonce': function(nonce) {

        return true;
    },

    'shopify/oauth/generateAccessToken': function(code, shop) {

        check(code, String);

        if (!shop || !code) {
            throw new Meteor.Error('400', 'Shopify app: Cannot generate Shopify access token: shop OR code parameters missing');
        }

        this.unblock();

        var apiKey = ShopifyApi.options.apiKey,
            secret = ShopifyApi.options.secret,
            shopName = shop.replace('.myshopify.com', '');

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

            // Save the new store doc
            var doc = {
                userId: this.userId,
                platformId: Meteor.call('shopify/getPlatformId'),
                configData: {
                    id: shop,
                    accessToken: result.data.access_token,
                    shopName: shopName,
                    shop: shop
                }
            };

            console.log(doc);
            Meteor.call('shopify/saveShop', doc, function (error, newId) {
                if (error) {
                    console.log(error);
                }
            });
        }
    },
    'shopify/saveShop': function(shop) {
        return Stores.insert(shop);
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

    'shopify/api/call': function(method, endpoint, params, content) {

        // Support (method, endpoint) argument list
        if (!params && !content) {
            var params = null;
            var content = null;
        }

        var shop = ShopifyApi.options.shopName,
            token = ShopifyApi.options.accessToken,
            apiUrl = 'https://' + shop + '.myshopify.com' + endpoint;

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