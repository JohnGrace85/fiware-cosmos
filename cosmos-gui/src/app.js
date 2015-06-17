/**
 * Copyright 2015 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of fiware-tidoop (FI-WARE project).
 *
 * fiware-tidoop is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
 * General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 * fiware-tidoop is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with fiware-tidoop. If not, see
 * http://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License please contact with
 * francisco dot romerobueno at telefonica dot com
 */

/**
 * cosmos-gui main app
 *
 * Author: frb
 */

// Module dependencies
var express = require('express');
var stylus = require('stylus');
var nib = require('nib');
var bodyParser = require('body-parser');
var config = require('../conf/cosmos-gui.json');
var mysqlDriver = require('./mysql_driver.js');
var OAuth2 = require('./oauth2').OAuth2;

// Express configuration
var app = express();

app.set('views', __dirname + '/../views');
app.set('view engine', 'jade');
app.use(express.logger());
app.use(stylus.middleware(
    { src: __dirname + '/../public',
        compile: compile
    }
));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({secret: "skjghskdjfhbqigohqdiouk"}));
app.configure(function () {
    "use strict";
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    app.use(express.static(__dirname + '/../public'));
});

function compile(str, path) {
    return stylus(str)
        .set('filename', path)
        .use(nib());
}

// Global variables
var port = config.gui.port;
var client_id = config.oauth2.client_id;
var client_secret = config.oauth2.client_secret;
var idmURL = config.oauth2.idmURL;
var response_type = config.oauth2.response_type;
var callbackURL = config.oauth2.callbackURL;

// Creates oauth library object with the config data
var oa = new OAuth2(client_id,
    client_secret,
    idmURL,
    '/oauth2/authorize',
    '/oauth2/token',
    callbackURL);

// Create a permanent connection to MySQL
mysqlDriver.connect();

// Handles requests to the main page
app.get('/', function (req, res) {
    var access_token = req.session.access_token;

    // Check if the user had a session
    if (access_token) {
        // Get user information given its access token
        oa.get(idmURL + '/user/', access_token, function (error, response) {
            if (error) {
                throw error;
            } else {
                // Get the user's IdM email (username)
                var idm_username = JSON.parse(response).email;
                req.session.idm_username = idm_username;

                // Check if the user, given its IdM username, has a Cosmos account
                mysqlDriver.getUser(idm_username, function(error, result) {
                    if (error) {
                        throw error;
                    } else if (result[0]) {
                        res.render('dashboard');
                    } else {
                        res.render('new_account');
                    }
                     // if else
                });
            } // if else
        });
    } else {
        res.redirect('/auth');
    } // if else
});

// Redirection to IDM authentication portal
app.get('/auth', function(req, res) {
    var path = oa.getAuthorizeUrl(response_type);
    res.redirect(path);
});

// Handles requests from IDM with the access code
app.get('/login', function(req, res) {
    // Using the access code goes again to the IDM to obtain the access_token
    oa.getOAuthAccessToken(req.query.code, function (e, results){
    // Stores the access_token in a session cookie
        req.session.access_token = results.access_token;
        res.redirect('/');
    });
});

app.post('/new_account', function(req, res) {
    var idm_username = req.session.idm_username;
    var username = idm_username.split('@')[0];
    var password1 = req.body.password1;
    var password2 = req.body.password2;

    if (password1 === password2) {
        mysqlDriver.addUser(idm_username, username, password1, function(error, result) {
            if (error) {
                throw error;
            } else {
                res.redirect('/');
            } // if else
        });
    } else {
        res.redirect('/');
    } // if else
});

// Handles logout requests to remove access_token from the session cookie
app.get('/logout', function(req, res){
    req.session.access_token = undefined;
    res.redirect('/');
});

// start the application, listening at the configured port
console.log("cosmos-gui running at http://localhost:" + port);
app.listen(port);