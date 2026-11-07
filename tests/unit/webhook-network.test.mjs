import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress } from "../../src/lib/webhook-network.mjs";

test("accepts globally routable IPv4 and IPv6 addresses", () => {
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("rejects private, loopback, link-local, and reserved IPv4 ranges", () => {
  for (const address of [
    "0.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("rejects non-global IPv6 ranges and mapped private IPv4 addresses", () => {
  for (const address of [
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2001:0::1",
    "2002::1",
    "::ffff:127.0.0.1",
    "::ffff:192.0.2.1",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("accepts IPv4-mapped globally routable IPv4 addresses", () => {
  assert.equal(isPublicAddress("::ffff:1.1.1.1"), true);
});

test("rejects hostnames and malformed addresses", () => {
  assert.equal(isPublicAddress("localhost"), false);
  assert.equal(isPublicAddress("not-an-ip"), false);
});
