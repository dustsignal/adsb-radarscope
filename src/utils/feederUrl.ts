// ADSB Radarscope
// Author: dustsignal
// GitHub: https://github.com/dustsignal/adsb-radarscope
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// Feeder address normalization for station setup.

/** Bare feeder hosts use the common tar1090 endpoint; explicit URLs keep their path. */
export function normalizeFeeder(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Enter a feeder IP, hostname, or aircraft JSON URL.');
  if (input.startsWith('/') && !input.startsWith('//')) return input;
  if (/\s/.test(input)) throw new Error('The feeder address cannot contain spaces.');
  const explicit = /^[a-z][a-z\d+.-]*:\/\//i.test(input);
  const url = new URL(explicit ? input : `http://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS feeder address without a username or password.');
  }
  if (url.pathname === '/') url.pathname = '/tar1090/data/aircraft.json';
  return url.href;
}
