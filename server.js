var http = require('http'),
  url = require('url'),
  path = require('path'),
  fs = require('fs'),
  mqtt = require('mqtt'),
  HID = require('node-hid')


var mqOptions = {
  port: 1883,
  host: 'mqtt://HOSTNAME',
  clientId: 'mqttjs_gps_' + Math.random().toString(16).substr(2, 8),
  username: 'USERNAME',
  password: 'PASSWORD',
  keepalive: 60,
  reconnectPeriod: 1000,
  clean: true,
  encoding: 'utf8'
}

var mqClient = mqtt.connect('mqtt://HOSTNAME', mqOptions)

mqClient.on('connect', () => {
  console.log("Connected to MQTT")
})

var devices = HID.devices()

var pllLock = -1
var gpsLock = -1
var signalLostCount = -1

var serialNumber, manufacturer, product,
    out1Enabled, out2Enabled, driveStrength, gpsFrequency, 
    n31, n2_hs, n2_ls, n1_hs, nc1_ls, nc2_ls, 
    vco, clock1, clock2

var deviceInfo = devices.find( (d) => {
  var gps = d.vendorId===7634 && d.productId===8720
  return gps
})

    // Output static information
if(deviceInfo) {

  serialNumber = deviceInfo.serialNumber
  manufacturer = deviceInfo.manufacturer
  product = deviceInfo.product

  var device = new HID.HID(7634, 8720)
  var buf = device.getFeatureReport(0x9, 60)

  out1Enabled = buf[0] & 0x01
  out2Enabled = buf[0] & 0x02 >> 1
  driveStrength = buf[1] > 3 ? buf[1] : 3
  gpsFrequency = (buf[4] << 16) + (buf[3] << 8) + buf[2]  
  n31 = ((buf[7] << 16) + (buf[6] << 8) + buf[5]) + 1
  n2_hs = buf[8] + 4
  n2_ls = ((buf[11] << 16) + (buf[10] << 8) + buf[9]) + 1
  n1_hs = buf[12] + 4
  nc1_ls = ((buf[15] << 16) + (buf[14] << 8) + buf[13]) + 1
  nc2_ls = ((buf[18] << 16) + (buf[17] << 8) + buf[16]) + 1 
  vco = gpsFrequency / n31 * n2_hs * n2_ls
  clock1 = vco / n1_hs / nc1_ls
  clock2 = vco / n1_hs / nc2_ls

  device.on("error", (error) => {
    console.log("Error: " + error)
  })

  device.on("data", (data) => {
    var temp = !(data[1] & 0x01)
    if(temp!=gpsLock) {
      gpsLock=temp
      if(gpsLock)
        console.log("GPS Locked")
      else 
        console.log("GPS Lost")
      mqClient.publish('gps/lock', gpsLock.toString())
    }
    temp = !(data[1] & 0x02 >> 1)
    if(temp!=pllLock) {
      pllLock=temp
      if(pllLock)
        console.log("pllLock Locked")
      else
        console.log("pllLock Lost")
      mqClient.publish('gps/pll', pllLock.toString())
    }
    if(data[0]!=signalLostCount) {
      signalLostCount = data[0]
      console.log("Signal Lost Count: " + signalLostCount)
      mqClient.publish('gps/signalLost', signalLostCount.toString())
    }
  })
}

var userCount = 0;
var intervalCount = 0;
var intervalRunning = false;

var server = http.createServer( (req,res) => {
	var pathname = url.parse(req.url).pathname;
	if(pathname=='/' || pathname=='/index.html') {
	    readFile(res,'index.html');
	} else {
		readFile(res, '.' + pathname)
	}
}).listen(3000);

readFile = function(res, pathname) {
     fs.readFile(pathname, (err, data) => {
       if(err) {
         console.log(err.message);
         res.writeHead(404, {'content-type': 'text/html'});
         res.write('File not found: ' + pathname);
		 res.end(data, 'utf-8');
       } else {
         var extension = path.extname(pathname);
         res.setHeader('Access-Control-Allow-Origin', "*");
         res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
         res.setHeader('Access-Control-Allow-Headers',  'X-Requested-With,content-type');
         res.setHeader('Access-Control-Allow-Credentials', true);
         if (extension == '.css') {
           res.writeHead(200, {'content-type': 'text/css'});
         } else if (extension == '.png') {
           res.writeHead(200, {'content-type': 'image/png'});
         } else if (extension == '.js') {
           res.writeHead(200, {'content-type': 'text/javascript'});
         } else {
           res.writeHead(200, {'content-type': 'text/html'});
         }
         res.write(data);
         res.end();
       }
     });
};

var io = require('socket.io').listen(server);

io.sockets.on('connection', (socket) => {

  emit_both = function(label, data) {
    socket.emit(label, data);
    // socket.broadcast.emit(label, data);
  };

  formatFreq = function(freq) {
    if(freq>999999999)
      return freq/1000000000 + " GHz"
    if(freq>999999)
      return freq/1000000 + " MHz"
    if(freq>999)
      return freq/1000 + " kHz"
    return freq + " Hz"
  }

  console.log('User connected');
  userCount++;
  emit_both('users',{number: userCount.toString()})
  socket.emit('clock1', formatFreq(clock1))
  socket.emit('clock2', formatFreq(clock2))
  socket.emit('out1enabled', out1Enabled)
  socket.emit('out2enabled', out2Enabled)
  socket.emit('gpsLock', gpsLock.toString())
  socket.emit('pllLock', pllLock.toString())
  socket.emit('signalLostCount', signalLostCount.toString())
  socket.emit('serialNumber', serialNumber.toString())
  socket.emit('manufacturer', manufacturer.toString())
  socket.emit('product', product.toString())
  socket.emit('driveStrength', driveStrength.toString())
  socket.emit('gpsFrequency', formatFreq(gpsFrequency))
  socket.emit('n31', n31.toString())
  socket.emit('n2_hs', n2_hs.toString())
  socket.emit('n2_ls', n2_ls.toString())
  socket.emit('n1_hs', n1_hs.toString())
  socket.emit('nc1_ls', nc1_ls.toString())
  socket.emit('nc2_ls', nc2_ls.toString())
  socket.emit('vco', formatFreq(vco))

  device.on("data", (data) => {
    var temp = !(data[1] & 0x01)
    if(temp!=gpsLock) {
      gpsLock=temp
      if(gpsLock)
        console.log("GPS Locked")
      else 
        console.log("GPS Lost")
      socket.emit('gpsLock', gpsLock.toString())
    }
    temp = !(data[1] & 0x02 >> 1)
    if(temp!=pllLock) {
      pllLock=temp
      if(pllLock)
        console.log("pllLock Locked")
      else
        console.log("pllLock Lost")
      socket.emit('pllLock', pllLock.toString())
    }
    if(data[0]!=signalLostCount) {
      signalLostCount = data[0]
      console.log("Signal Lost Count: " + signalLostCount)
      socket.emit('signalLostCount', signalLostCount.toString())
    }
  })

  socket.on('disconnect', () => {
    console.log('disconnected');
    userCount--;
    socket.broadcast.emit('users',{number: userCount.toString()});
  });

});


console.log('Server is running')