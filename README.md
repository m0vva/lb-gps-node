## Overview ##

This provides a simple web page to show the current running configuration of the USB connected Leo Bodnar GPS-Clock device
including real-time status of GPS and PLL locks.  These lock statuses are also pushed to an MQTT service for 
alerting/reporting in real time.

## Prerequisites ##

node.js\
npm install mqtt\
npm install node-hid\
npm install socket.io

## Configuration ##

Edit server.js:

  var mqOptions = {\
     \...\
     username: 'USERNAME',  // username for MQTT connection\
     password: 'PASSWORD,   // password for MQTT connection\
     \...\
  }
  
  var server = \...\
     \...\
  \}).listen(3000);  // change 3000 to required web server port

## Usage ##

usage: node .\/server.js

open a browser http:\/\/\<hostname\>:\<port\>
