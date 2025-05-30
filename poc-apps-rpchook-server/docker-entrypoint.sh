#!/bin/sh
set -e

if [ -n "$NPM_TOKEN" ]; then
  cat <<EOF > /root/.npmrc
@tetherto:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
EOF
fi

exec "$@"