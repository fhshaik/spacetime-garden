#!/bin/sh
# Container start: substitute env vars into config.js so the same image
# can be promoted dev → uat → prod with different API_BASE values.
# Without this, vite would bake env at build time and we'd need three images.
set -eu

: "${API_BASE:=}"
export API_BASE

envsubst '$API_BASE' \
    < /usr/share/nginx/html/config.js.template \
    > /usr/share/nginx/html/config.js

exec "$@"
