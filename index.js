var ArrayGrid = require('array-grid')
var LoopGrid = require('loop-grid')

var PortHolder = require('midi-port-holder')
var computedPortNames = require('midi-port-holder/computed-port-names')
var NormalizeMidiNotes = require('midi-port-holder/normalize-notes')

var ObservMidi = require('observ-midi')
var ObservGridGrabber = require('observ-grid/grabber')

var DittyGridStream = require('ditty-grid-stream')

var mapGridValue = require('observ-grid/map-values')
var computed = require('observ/computed')
var watch = require('observ/watch')

var Repeater = require('./lib/repeater.js')
var repeatStates = [2, 1, 1/2, 1/4, 1/8, 2/3, 1/3, 1/6]

module.exports = function MpkController(opts){

  var mapping = getMpkMapping()
  opts = Object.create(opts)
  opts.shape = mapping.shape

  var portHolder = PortHolder(opts)

  // normalize is needed because the MPK triggers [128, noteId, 127] on note offs
  // instead of 0 velocity note on event: [144, noteId, 0]
  var duplexPort = NormalizeMidiNotes(portHolder.stream)
  var triggerOutput = opts.triggerOutput

  var self = LoopGrid(opts, {
    port: portHolder
  })

  self.portChoices = computedPortNames()

  var output = mapGridValue(self.playing, 127)
  var keys = ObservMidi(duplexPort, mapping, output)
  var inputGrabber = ObservGridGrabber(keys)

  DittyGridStream(inputGrabber, self.grid, opts.scheduler).pipe(opts.triggerOutput)

  // Program Change for loop controls
  duplexPort.on('data', function(data){
    if (data[0] === 192 && data[1] === 3){
      if (data[1] === 3){
        self.store()
      } else if (data[1] === 2){
        self.redo()
      } else if (data[1] === 1){
        self.undo()
      }
    }
  })

  // CC repeater controls
  var repeatLengthKnob = ObservMidi(duplexPort, '176/8')
  var repeater = Repeater(self.transform)
  var lastRepeatIndex = 0
  watch(repeatLengthKnob, function(value){
    var index = Math.floor(value / 128 * repeatStates.length)
    console.log(index)
    if (lastRepeatIndex !== index){
      if (index === 0){
        repeater.stop()
      } else {
        repeater.start(inputGrabber, repeatStates[index])
      }
      lastRepeatIndex = index
    }
  })

  return self
}

function getMpkMapping(){
  var data = []
  for (var i=36;i<=84;i++){
    data.push('144/' + i)
  }
  return ArrayGrid(data, [1, data.length])
}