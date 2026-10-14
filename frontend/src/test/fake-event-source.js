/**
 * Stand-in for the browser's EventSource (jsdom has none). Tests push events with
 * `FakeEventSource.latest().emit('order', data)`.
 */
export class FakeEventSource {
  static instances = [];

  static latest() {
    return FakeEventSource.instances.at(-1);
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  constructor(url, options) {
    this.url = url;
    this.withCredentials = options?.withCredentials ?? false;
    this.listeners = new Map();
    this.closed = false;
    this.onopen = null;
    this.onerror = null;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, listener) {
    const set = this.listeners.get(name) ?? new Set();
    set.add(listener);
    this.listeners.set(name, set);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.({});
  }

  fail() {
    this.onerror?.({});
  }

  emit(name, data) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }
}
