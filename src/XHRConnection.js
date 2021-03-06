import AbstractConnection from "./AbstractConnection";
import ConnectionEvent from "./ConnectionEvent";

const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE"];
const ALLOWED_RESPONSE_TYPES = [
  "arraybuffer",
  "blob",
  "document",
  "json",
  "text"
];

/**
 * Basic XHR Connection
 */
export default class XHRConnection extends AbstractConnection {
  /**
   * Initializes an Instance of XHRConnection
   * @constructor
   * @param {string} url – URL to be fetched
   * @param {object} [options]
   * @param {string} [options.method=GET] – used method
   * @param {*} [options.body] – payload for request
   * @param {object} [options.headers] – additional headers (like content-type)
   * @param {string} [options.responseType]
   * @param {int} [timeout]
   */
  constructor(url, options = {}) {
    super(url);

    const {
      method = "GET",
      body = null,
      headers = {
        Accept: "application/json"
      },
      responseType = "json",
      timeout = 0,
      listeners = [],
      open = false
    } = options;

    if (!ALLOWED_METHODS.includes(method)) {
      throw new Error(
        `Invalid method "${method}". Valid methods are: "${ALLOWED_METHODS.join(
          '", "'
        )}".`
      );
    }

    if (!ALLOWED_RESPONSE_TYPES.includes(responseType)) {
      throw new Error(
        `Invalid response type "${responseType}". Valid reponse types are "${ALLOWED_RESPONSE_TYPES.join(
          '", "'
        )}".`
      );
    }

    if (typeof headers !== "object") {
      throw new Error(
        `Invalid headers. Type must be "object", is "${typeof headers}".`
      );
    }

    if (!Number.isSafeInteger(timeout) || timeout < 0) {
      throw new Error(
        `Invalid timeout. Must be an integer >= 0 and less than Number.MAX_SAFE_INTEGER, is "${timeout}".`
      );
    }

    if(!(listeners instanceof Array)) {
      throw new Error(`Invalid listeners array type. Has to be an array.`);
    }

    listeners.forEach(listenerObj => {
      if(!listenerObj || typeof(listenerObj) !== "object") {
        throw new Error(`Invalid listener object type "${typeof(listenerObj)}". Has to be an object.`);
      }
      if(!ConnectionEvent.includes(listenerObj.type)) {
        throw new Error(`Unknown ConnectionEvent.type: "${listenerObj.type}". Has to be one of: OPEN, DATA, ERROR, COMPLETE, ABORT`);
      }
      if(typeof(listenerObj.callback) !== "function") {
        throw new Error(`Invalid Callback type "typeof(listenerObj.callback)" for ${listenerObj.type}. Has to be a function.`);
      }

      this.addListener(listenerObj.type, listenerObj.callback);
    });

    /**
     * @property {string}
     * @protected
     * @name XHRConnection#method
     */
    Object.defineProperty(this, "method", { value: method });

    /**
     * @property {*}
     * @protected
     * @name XHRConnection#body
     */
    Object.defineProperty(this, "body", { value: body });

    /**
     * @property {object}
     * @protected
     * @name XHRConnection#headers
     */
    Object.defineProperty(this, "headers", { value: headers });

    /**
     * @property {string}
     * @protected
     * @name XHRConnection#responseType
     */
    Object.defineProperty(this, "responseType", { value: responseType });

    /**
     * @property {int}
     * @protected
     * @name XHRConnection#timeout
     */
    Object.defineProperty(this, "timeout", { value: timeout });

    /**
     * @property {XMLHttpRequest}
     * @protected
     * @name XHRConnection#xhr
     */
    Object.defineProperty(this, "xhr", { value: new XMLHttpRequest() });

    // open immediatly?
    if(options.open) {
      this.open();
    }
  }

  get response() {
    /**
     * IE11 doesnt support responseType="json" correctly,
     * it will fall back to plain text, so we have to parse it.
     */
    if (
      this.responseType === "json" &&
      this.xhr.response &&
      this.xhr.responseType === ""
    ) {
      return JSON.parse(this.xhr.response);
    }

    return this.xhr.response;
  }

  get status() {
    return this.xhr.status;
  }

  /**
   * create, prepare, open and send the xhr request
   * @param {array} - header.
   * @return {XHRconnection} - this connection
   */
  open(headers) {
    if (this.state !== XHRConnection.INIT) {
      return;
    }

    this.xhr.addEventListener("progress", () => {
      window.setTimeout(() => {
        this.emit(
          ConnectionEvent.DATA,
          new ConnectionEvent(this, ConnectionEvent.DATA)
        );
      }, 0);
    });

    this.xhr.addEventListener("load", () => {
      this.state = XHRConnection.CLOSED;
      this.closed = Date.now();

      if (this.status < 400) {
        window.setTimeout(() => {
          this.emit(
            ConnectionEvent.COMPLETE,
            new ConnectionEvent(this, ConnectionEvent.COMPLETE)
          );
        }, 0);

        return;
      }

      window.setTimeout(() => {
        this.emit(
          ConnectionEvent.ERROR,
          new ConnectionEvent(this, ConnectionEvent.ERROR)
        );
      }, 0);
    });

    this.xhr.addEventListener("abort", () => {
      this.state = XHRConnection.CLOSED;
      this.closed = Date.now();

      window.setTimeout(() => {
        this.emit(
          ConnectionEvent.ABORT,
          new ConnectionEvent(this, ConnectionEvent.ABORT)
        );
      }, 0);
    });

    this.xhr.addEventListener("error", () => {
      this.state = XHRConnection.CLOSED;
      this.closed = Date.now();

      window.setTimeout(() => {
        this.emit(
          ConnectionEvent.ERROR,
          new ConnectionEvent(this, ConnectionEvent.ERROR)
        );
      }, 0);
    });

    this.xhr.addEventListener("timeout", () => {
      this.state = XHRConnection.CLOSED;
      this.closed = Date.now();

      window.setTimeout(() => {
        this.emit(
          ConnectionEvent.ERROR,
          new ConnectionEvent(this, ConnectionEvent.ERROR)
        );
      }, 0);
    });

    this.xhr.open(this.method, this.url);
    this.xhr.timeout = this.timeout;
    this.state = XHRConnection.OPEN;
    this.opened = Date.now();
    window.setTimeout(() => {
      this.emit(
        ConnectionEvent.OPEN,
        new ConnectionEvent(this, ConnectionEvent.OPEN)
      );
    }, 0);

    Object.keys(this.headers).forEach(key => {
      if (this.headers[key] !== undefined && this.headers[key] !== null) {
        this.xhr.setRequestHeader(key, this.headers[key]);
      }
    });

    if(typeof(headers) === "object") {
      Object.keys(headers).forEach(key => {
        if (headers[key] !== undefined && headers[key] !== null) {
          this.xhr.setRequestHeader(key, headers[key]);
        }
      });
    }

    this.xhr.responseType = this.responseType;
    this.xhr.send(this.body);

    return this;
  }

  /**
   * @description Close the connection and abort open requests
   */
  close() {
    if (this.state === XHRConnection.INIT) {
      this.state = XHRConnection.CLOSED;
      this.closed = Date.now();
      window.setTimeout(() => {
        this.emit(
          ConnectionEvent.ABORT,
          new ConnectionEvent(this, ConnectionEvent.ABORT)
        );
      }, 0);
    }

    if (this.state === XHRConnection.OPEN) {
      this.xhr.abort();
    }
  }
}
