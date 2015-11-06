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
ShopifyApi.init = function (options) {
    check(options, Object);

    // Set passed options
    ShopifyApi.options = options;
};

Meteor.startup(function () {

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
    'shopify/getInstallURL': shop => {
        return `https://${shopName}.myshopify.com/admin/oauth/authorize?
            client_id=${ShopifyApi.options.apiKey}
            &scope=${ShopifyApi.options.scopes}
            &redirect_uri=${ShopifyApi.options.appUrl}/shopify/authenticate
            &state=${Meteor.settings.shopify.nonce}`
    },

    'shopify/getShopifyConfig': shop => {
        return {
            appUrl: Meteor.settings.shopify.appUrl,
            shop: shop.shopName,
            apiKey: Meteor.settings.shopify.apiKey,
            scopes: Meteor.settings.shopify.scopes
        }
    },

    'shopify/getPlatformId': () => {
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
    'shopify/validateAuthCode': params => {

        check(params, Object);

        let hmac = params.hmac;

        // Delete signature and hmac as shopify docs specifies
        delete params.signature;
        delete params.hmac;

        // Create message query string
        let message = serializeObject(params);

        // Do the hmac sha256 encrypting
        let hash = CryptoJS.HmacSHA256(message, ShopifyApi.options.secret)
            .toString();

        // Return true if we have a match, otherwise return false
        return hash === hmac;
    },

    'shopify/validateNonce': nonce => {
        return true;
    },

    'shopify/oauth/generateAccessToken': function ({
        code, shop
    }) {

        check(code, String);

        if (!shop || !code) {
            throw new Meteor.Error('400', 'Shopify app: Cannot generate Shopify access token: shop OR code parameters missing');
        }

        this.unblock();

        let shopName = shop.replace('.myshopify.com', ''),
            url = `https://${shopName}/admin/oauth/access_token`,
            data = {
                client_id: ShopifyApi.options.apiKey,
                client_secret: ShopifyApi.options.secret,
                code: code
            };

        // Request permanent access token from shopfiy
        let result = HTTP.post(url, {
            params: data
        });

        if (result.statusCode === 200) {

            // Save the new store doc
            let doc = {
                userId: this.userId,
                platformId: Meteor.call('shopify/getPlatformId'),
                configData: {
                    id: shop,
                    accessToken: result.data.access_token,
                    shopName: shopName,
                    shop: shop
                }
            };

            Meteor.call('shopify/saveShop', doc, function (error, newId) {
                if (error) {
                    console.log(error);
                }
            });
        }
    },

    'shopify/saveShop': store => {
        return Stores.insert(store);
    },

    'shopify/updateOrCreateUser': function (shop, accessToken) {

        check(shop, String);
        check(accessToken, String);

        // Get shop name from shop
        let shopName = shop.replace('.myshopify.com', '');

        let serviceData = {
            id: shop,
            accessToken: accessToken,
            shopName: shopName,
            shop: shop
        };

        // Accounts.updateOrCreateUserFromExternalService is a function located in accounts-base/accounts_server.js
        // This function updates or creates a user with the external service (shopify) authentication data specified above.
        return Accounts.updateOrCreateUserFromExternalService('shopify', serviceData);
    },

    'shopify/api/call': function ({
        method, endpoint, data = null, params = null
    } = {}) {
        let shop = ShopifyApi.options.shopName,
            token = ShopifyApi.options.accessToken,
            apiUrl = `https://${shop}.myshopify.com${endpoint}`;

        if (!shop || !token || !apiUrl) {
            throw new Meteor.Error('400', 'Shopify app: Missing parameter for Shopify API call');
        }

        this.unblock();

        let options = {
            headers: {
                "X-Shopify-Access-Token": token,
                "content-type": "application/json"
            },
            data: data,
            params: params
        };

        try {
            let result = HTTP.call(method, apiUrl, options);
            return result.data;

        } catch (error) {
            // Network error, time-out or HTTP error in the 400 or 500 range.
            return error;
        }
    },

    'shopify/registerWebhook': function ({
        store_id,
        topic,
        event
    } = {}) {
        Meteor.defer(() => {
            ShopifyApi.init(
                Meteor.call('getStoreConfig', store_id)
            );

            let opts = {
                method: 'POST',
                endpoint: '/admin/webhooks.json',
                data: {
                    webhook: {
                        "topic": `${topic}/${event}`,
                        "address": `${Meteor.settings.shopify.url}/${topic}/${store_id}`,
                        "format": "json"
                    }
                }
            };

            return Meteor.call("shopify/api/call", opts);
        });
    },

    'shopify/registerWebhooksRequiredForApp': function ({
        store_id
    } = {}) {
        _.forIn(Meteor.settings.shopify.webhooks, (events, topic) => {
            _.each(events, event => Meteor.call('shopify/registerWebhook', {
                store_id, topic, event
            }));
        });
    },

    'shopify/getWebhooks': function ({
        store_id
    } = {}) {
        this.unblock();
        ShopifyApi.init(
            Meteor.call('getStoreConfig', store_id)
        );

        let opts = {
            method: 'GET',
            endpoint: '/admin/webhooks.json'
        };

        return Meteor.call("shopify/api/call", opts);
    },

    'shopify/deleteWebhook': function ({
        store_id,
        hook_id
    } = {}) {
        this.unblock();
        ShopifyApi.init(
            Meteor.call('getStoreConfig', store_id)
        );

        let opts = {
            method: 'DELETE',
            endpoint: `/admin/webhooks/${hook_id}.json`
        };

        return Meteor.call("shopify/api/call", opts);
    },

    'shopify/deleteAllWebhooks': function ({
        store_id
    } = {}) {
        let getHooks = new Promise((resolve, reject) => {
            Meteor.call('getWebhooks', {
                store_id
            }, (error, success) => {
                if (success) {
                    resolve(success.webhooks);
                } else {
                    reject(error);
                }
            })
        });

        getHooks.then(hooks => {
            _.each(hooks, h => Meteor.call('shopify/deleteWebhook', {
                store_id, hook_id: h.id
            }))
        }).catch(err => {
            throw err;
        });
    },
});

// Register login handler for shopify embedded app login
Accounts.registerLoginHandler(function (loginRequest) {

    if (!loginRequest.shopify)
        return undefined; // if the login request is not for shopify, don't handle

    return {
        userId: loginRequest.userId
    };
});

let serializeObject = function (object) {
    let string = [];
    for (let param in object)
        if (object.hasOwnProperty(param)) {
            string.push(encodeURIComponent(param) + "=" + encodeURIComponent(object[param]));
        }
    return string.join("&");
};