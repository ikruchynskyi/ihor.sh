#!/bin/sh
# The radio dongle, by hand:  ./dongle.sh            what it's doing, who's connected
#                             ./dongle.sh free       disconnect every Spectrum Lab listener and APRS/ADS-B viewer, release it
#                             ./dongle.sh aprs|adsb  switch a decoder on
SDR=http://127.0.0.1:8073
case "${1:-status}" in
  status) curl -s $SDR/api/state ;;
  free) curl -s -X POST $SDR/api/admin/free ;;
  aprs|adsb) curl -s -X POST $SDR/api/receiver -H 'content-type: application/json' -d "{\"mode\":\"$1\"}" ;;
  *) sed -n '2,4p' "$0"; exit 1 ;;
esac
echo
