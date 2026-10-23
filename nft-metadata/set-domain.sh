#!/bin/sh
# If Cloudflare gave the site a different address, run: ./set-domain.sh https://your-address.pages.dev
# then deploy again.
[ -z "$1" ] && { echo "usage: ./set-domain.sh https://name.pages.dev"; exit 1; }
NEW=${1%/}
sed -i.bak "s#https://opinions-nft.pages.dev#$NEW#g" opinions.json collection.json && rm -f *.bak
echo "Updated JSON to $NEW"
