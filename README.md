### Meteor JS Package
# shopify-api

Meteor JS package for building embedded Shopify apps that use the Shopify API.
This package handles everything needed to set-up an embedded Shopify app including OAuth authentication / Meteor login with Shopify process and working with the Shopify API.

This package does not include all of the Shopify API endpoints, you can add your own as required depending on the functionality of your app.

[View package on Atmosphere](https://atmospherejs.com/cliffers/shopify-api)

#### Install package

```
meteor add cliffers:shopify-api
```

## Package Init

#### Client Init
```
// Setup Shopify API options for client
ShopifyApi.init({
    appUrl: 		'https://yourAppUrl.com',
    apiKey: 		'App API Key...',
    scopes: 		'Shopify API scopes', 		// https://docs.shopify.com/api/authentication/oauth#scopes
```

#### Server Init
```
// Setup Shopify API options for server
ShopifyApi.init({
    apiKey: 	'App API Key...',
    secret: 	'App Secret...',
});
```

## App Authenication / Login
This package allows your embedded app to login in your shop admin into your app using Shopify OAuth authentication.
It will create a Meteor user and store the shop credentials and OAuth tokens etc.
Everytime a shop needs to login the OAuth process / handshake is re-authenicated and a new token is stored. This is recommended by Shopify.

Calling this function runs the login / auth process:

```
ShopifyApi.authorizeApp(queryParams);
```

If your using Iron:router then you can add the login check to a onBeforeAction like so:

```
/* --------------------------------------
 * Login check
 * --------------------------------------
 * Using the Iron Router onBeforeAction to check if the user is logged in or not
 * If not, start the login process
 * Specify which routes require authenication by adding specific routes to the array in the 'only' param
 * You can also use 'except' rather than 'only' if you want to exclude certain routes
 * ------------------------------------*/
Router.onBeforeAction(function() {

	// If not logged in, handle the shopify OAuth login process before anything else
	if (!Meteor.userId()) {
		ShopifyApi.authorizeApp(this.params.query);
	}

	this.next();

}, { only: ['route1', 'route2', 'etc..'] });
```

## Using the Shopify API

This package gives you a API method for use with all of the Shopify API endpoints.

Just call `Meteor.call('shopify/api/call', 'GET', endpoint);`

You can replace 'GET' with any of the Meteor HTTP Methods such as:
'GET', 'POST', 'PUT', 'DEL'

Example custom endpoint method that you would add into your app:

```
Meteor.methods({
	
	/* ------------------------------------------------
	 * Example Shopify API Endpoint Method
	 * ------------------------------------------------
	 * Create your custom endpoint methods like this..
	 * ----------------------------------------------*/
	'shopify/api/product/get': function(variantId) {

		// Specifiy your the Shopify API endpoint
		var endpoint = '/admin/products/' + variantId + '.json';

		// Call the shopify/api/call method that comes with this package
		var result = Meteor.call('shopify/api/call', 'GET', endpoint);

		return result;
	},
});
```

*** Package is still in development ***
Any questions / improvments, please create an issue.

