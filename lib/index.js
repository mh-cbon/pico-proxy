'use strict';

var protocol = {
  http: require('http'),
  https: require('https')
};

var url = require('url');

function corsHeaders(overrides) {
  return [
    'Access-Control-Allow-Origin',
    'Access-Control-Request-Method',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Credentials'
  ].reduce(function (headers, method) {
    var defVal = method.match(/allow-credentials/i) ? 'true' : '*';
    headers[method] = overrides[method] || defVal;

    return headers;
  }, {});
}

function PicoProxy(options) {
  options = options || {};

  if (!(this instanceof PicoProxy)) {
    return new PicoProxy(options);
  }

  this._target = url.parse(options.target || 'http://127.0.0.1');
  this._protocol = options.protocol || 'http';
  this._targetProtocol = this._target.protocol.slice(0, -1);
  this._cors = options.cors || true;
  // if allow credentials is true, ensure authorization is part of authorized headers
  if (options.allowCredentials && (!options.allowHeaders || !options.allowHeaders.match(/Authorization/i))) {
    if (options.allowHeaders==='*') {
      console.error('WARNING: It is forbidden to set Access-Control-Allow-Headers: *')
      console.error('when Access-Control-Allow-Credentials: true is set')
      console.error('see http://stackoverflow.com/questions/19743396/cors-cannot-use-wildcard-in-access-control-allow-origin-when-credentials-flag-i')
    } else {
      if (!options.allowHeaders) options.allowHeaders = '';
      options.allowHeaders += ' Authorization'
    }
  }
  this._corsOverrides = {
    'Access-Control-Allow-Headers': options.allowHeaders || '*',
    'Access-Control-Allow-Methods': options.allowMethods || '*',
  };

  this._proxy = this.createServer(function (req, res) {
    var request = protocol[this._protocol].request(this.createRequestOptions(req), function (serverRes) {
      if (this._cors) {
        serverRes.headers['Access-Control-Allow-Origin'] = '*'
        if (options.allowCredentials)
          serverRes.headers['Access-Control-Allow-Credentials'] = 'true'
      }

      res.writeHead(serverRes.statusCode, serverRes.headers);
      serverRes.pipe(res);
    }.bind(this));

    req.pipe(request);
  }.bind(this));

  return this;
}

PicoProxy.prototype.createRequestOptions = function (req) {
  var requestUrl = url.parse(req.url);

  return {
    method: req.method,
    hostname: this._target.hostname,
    port: this._target.port,
    path: requestUrl.path,
    headers: Object.keys(req.headers).reduce(function (reqHeaders, header) {
      reqHeaders[header] = header === 'host' ? this._target.hostname : req.headers[header];

      return reqHeaders;
    }.bind(this), {})
  };
};

PicoProxy.prototype.listen = function (port, cb) {
  port = port || 8080;
  this._proxy.listen(port, cb);

  return this;
};

PicoProxy.prototype.close = function () {
  this._proxy.close();
};

PicoProxy.prototype.createServer = function (cb) {
  return protocol[this._protocol].createServer(function (req, res) {
    if (this._cors) {
      res.writeHead(200, corsHeaders(this._corsOverrides));
    }

    if (this._cors && req.method.toLowerCase() === 'options') {
      return res.end();
    }

    cb(req, res);
  }.bind(this));
};

exports = module.exports = PicoProxy;
