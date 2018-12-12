const { rpc, rpc_process } = require('carlo/rpc');
const http = require('http');

class NetworkBackend {
  constructor(frontend) {
    require('../lib/process_utility.js')('network', () => this.dispose());
    this._frontend = frontend;
  }

  async init(frontend) {
    this._frontend = frontend;
    frontend.dispatchMessage(JSON.stringify({
      "method": "Network.requestWillBeSent",
      "params": {
        "requestId": "E6BFAE0AFFF1A393ED57B66729D69414",
        "loaderId": "E6BFAE0AFFF1A393ED57B66729D69414",
        "documentURL": "http://jsonplaceholder.typicode.com/todos/1",
        "request": {
          "url": "http://jsonplaceholder.typicode.com/todos/1",
          "method": "GET",
          "headers": {
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3634.0 Safari/537.36"
          },
          "mixedContentType": "none",
          "initialPriority": "VeryHigh",
          "referrerPolicy": "no-referrer-when-downgrade"
        },
        "timestamp": 341143.242095,
        "wallTime": 1544306456.209423,
        "initiator": {
          "type": "other"
        },
        "type": "Document",
        "frameId": "73C66C7AFC92C036A02B42ABBF87D5BD",
        "hasUserGesture": false
      }
    }))
  }

  dispose() {
    Promise.resolve().then(() => process.exit(0));
  }
}

rpc_process.init(frontend => rpc.handle(new NetworkBackend(frontend)));

