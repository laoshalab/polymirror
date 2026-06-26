export function polymarketProfileUrl(opts: {
  username?: string;
  address?: string;
}): string | null {
  const username = opts.username?.trim();
  if (username) {
    return `https://polymarket.com/@${encodeURIComponent(username.replace(/^@/, ""))}`;
  }
  const address = opts.address?.trim();
  if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
    return `https://polymarket.com/profile/${address}`;
  }
  return null;
}
