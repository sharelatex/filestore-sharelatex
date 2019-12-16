assert = require("chai").assert
sinon = require('sinon')
chai = require('chai')
should = chai.should
expect = chai.expect
modulePath = "../../../app/js/FSPersistorManager.js"
SandboxedModule = require('sandboxed-module')
fs = require("fs")
response = require("response")

describe "FSPersistorManagerTests", ->

  beforeEach ->
    @Fs =
      rename:sinon.stub()
      createReadStream:sinon.stub()
      createWriteStream:sinon.stub()
      unlink:sinon.stub()
      rmdir:sinon.stub()
      exists:sinon.stub()
      readdir:sinon.stub()
      open:sinon.stub()
      openSync:sinon.stub()
      fstatSync:sinon.stub()
      closeSync:sinon.stub()
      stat:sinon.stub()
    @Rimraf = sinon.stub()
    @LocalFileWriter =
      writeStream: sinon.stub()
      deleteFile: sinon.stub()
    @requires =
      "./LocalFileWriter":@LocalFileWriter
      "fs":@Fs
      "logger-sharelatex":
        log:->
        err:->
      "response":response
      "rimraf":@Rimraf
      "./Errors": @Errors =
        NotFoundError: sinon.stub()
    @location = "/tmp"
    @name1 = "530f2407e7ef165704000007/530f838b46d9a9e859000008"
    @name1Filtered ="530f2407e7ef165704000007_530f838b46d9a9e859000008"
    @name2 = "second_file"
    @error = "error_message"
    @FSPersistorManager = SandboxedModule.require modulePath, requires: @requires

  describe "sendFile", ->
    beforeEach ->
      @Fs.createReadStream = sinon.stub().returns({
        on: ->
        pipe: ->
      })

    it "should copy the file", (done) ->
      @Fs.createWriteStream =sinon.stub().returns({
        on: (event, handler) ->
          process.nextTick(handler) if event is 'finish'
      })
      @FSPersistorManager.sendFile @location, @name1, @name2, (err)=>
        @Fs.createReadStream.calledWith(@name2).should.equal true
        @Fs.createWriteStream.calledWith("#{@location}/#{@name1Filtered}" ).should.equal true
        done()

    it "should return an error if the file cannot be stored", (done) ->
      @Fs.createWriteStream =sinon.stub().returns({
        on: (event, handler) =>
         if event is 'error'
          process.nextTick () =>
            handler(@error)
      })
      @FSPersistorManager.sendFile @location, @name1, @name2, (err)=>
        @Fs.createReadStream.calledWith(@name2).should.equal true
        @Fs.createWriteStream.calledWith("#{@location}/#{@name1Filtered}" ).should.equal true
        err.should.equal @error
        done()

  describe "sendStream", ->
    beforeEach ->
      @FSPersistorManager.sendFile = sinon.stub().callsArgWith(3)
      @LocalFileWriter.writeStream.callsArgWith(2, null, @name1)
      @LocalFileWriter.deleteFile.callsArg(1)
      @SourceStream =
        on:->

    it "should sent stream to LocalFileWriter", (done)->
      @FSPersistorManager.sendStream @location, @name1, @SourceStream, =>
        @LocalFileWriter.writeStream.calledWith(@SourceStream).should.equal true
        done()

    it "should return the error from LocalFileWriter", (done)->
      @LocalFileWriter.writeStream.callsArgWith(2, @error)
      @FSPersistorManager.sendStream @location, @name1, @SourceStream, (err)=>
        err.should.equal @error
        done()

    it "should send the file to the filestore", (done)->
      @LocalFileWriter.writeStream.callsArgWith(2)
      @FSPersistorManager.sendStream @location, @name1, @SourceStream, (err)=>
        @FSPersistorManager.sendFile.called.should.equal true
        done()

  describe "getFileStream", ->
    beforeEach ->
      @opts = {}

    it "should use correct file location", (done) ->
      @FSPersistorManager.getFileStream @location, @name1, @opts, (err,res) =>
      @Fs.open.calledWith("#{@location}/#{@name1Filtered}").should.equal true
      done()

    describe "with start and end options", ->

      beforeEach ->
        @fd = 2019
        @opts_in = {start: 0, end: 8}
        @opts = {start: 0, end: 8, fd: @fd}
        @Fs.open.callsArgWith(2, null, @fd)

      it 'should pass the options to createReadStream', (done) ->
        @FSPersistorManager.getFileStream @location, @name1, @opts_in, (err,res)=>
        @Fs.createReadStream.calledWith(null, @opts).should.equal true
        done()

    describe "error conditions", ->

      describe "when the file does not exist", ->

        beforeEach ->
          @fakeCode = 'ENOENT'
          err = new Error()
          err.code = @fakeCode
          @Fs.open.callsArgWith(2, err, null)

        it "should give a NotFoundError", (done) ->
          @FSPersistorManager.getFileStream @location, @name1, @opts, (err,res)=>
            expect(res).to.equal null
            expect(err).to.not.equal null
            expect(err instanceof @Errors.NotFoundError).to.equal true
            done()

      describe "when some other error happens", ->

        beforeEach ->
          @fakeCode = 'SOMETHINGHORRIBLE'
          err = new Error()
          err.code = @fakeCode
          @Fs.open.callsArgWith(2, err, null)

        it "should give an Error", (done) ->
          @FSPersistorManager.getFileStream @location, @name1, @opts, (err,res)=>
            expect(res).to.equal null
            expect(err).to.not.equal null
            expect(err instanceof Error).to.equal true
            done()

  describe "getFileSize", ->
    it "should return the file size", (done) ->
      expectedFileSize = 75382
      @Fs.stat.yields(new Error("fs.stat got unexpected arguments"))
      @Fs.stat.withArgs("#{@location}/#{@name1Filtered}")
        .yields(null, { size: expectedFileSize })

      @FSPersistorManager.getFileSize @location, @name1, (err, fileSize) =>
        if err?
          return done(err)
        expect(fileSize).to.equal(expectedFileSize)
        done()

    it "should throw a NotFoundError if the file does not exist", (done) ->
      error = new Error()
      error.code = "ENOENT"
      @Fs.stat.yields(error)

      @FSPersistorManager.getFileSize @location, @name1, (err, fileSize) =>
        expect(err).to.be.instanceof(@Errors.NotFoundError)
        done()

    it "should rethrow any other error", (done) ->
      error = new Error()
      @Fs.stat.yields(error)

      @FSPersistorManager.getFileSize @location, @name1, (err, fileSize) =>
        expect(err).to.equal(error)
        done()

  describe "copyFile", ->
    beforeEach ->
      @ReadStream=
        on:->
        pipe:sinon.stub()
      @WriteStream=
        on:->
      @Fs.createReadStream.returns(@ReadStream)
      @Fs.createWriteStream.returns(@WriteStream)

    it "Should open the source for reading", (done) ->
      @FSPersistorManager.copyFile @location, @name1, @name2, ->
      @Fs.createReadStream.calledWith("#{@location}/#{@name1Filtered}").should.equal true
      done()

    it "Should open the target for writing", (done) ->
      @FSPersistorManager.copyFile @location, @name1, @name2, ->
      @Fs.createWriteStream.calledWith("#{@location}/#{@name2}").should.equal true
      done()

    it "Should pipe the source to the target", (done) ->
      @FSPersistorManager.copyFile @location, @name1, @name2, ->
      @ReadStream.pipe.calledWith(@WriteStream).should.equal true
      done()

  describe "deleteFile", ->
    beforeEach ->
      @Fs.unlink.callsArgWith(1,@error)

    it "Should call unlink with correct options", (done) ->
      @FSPersistorManager.deleteFile @location, @name1, (err) =>
        @Fs.unlink.calledWith("#{@location}/#{@name1Filtered}").should.equal true
        done()

    it "Should propogate the error", (done) ->
      @FSPersistorManager.deleteFile @location, @name1, (err) =>
        err.should.equal @error
        done()


  describe "deleteDirectory", ->
    beforeEach ->
      @Rimraf.callsArgWith(1,@error)

    it "Should call rmdir(rimraf) with correct options", (done) ->
      @FSPersistorManager.deleteDirectory @location, @name1, (err) =>
        @Rimraf.calledWith("#{@location}/#{@name1Filtered}").should.equal true
        done()

    it "Should propogate the error", (done) ->
      @FSPersistorManager.deleteDirectory @location, @name1, (err) =>
        err.should.equal @error
        done()

  describe "checkIfFileExists", ->
    beforeEach ->
      @Fs.exists.callsArgWith(1,true)

    it "Should call exists with correct options", (done) ->
      @FSPersistorManager.checkIfFileExists @location, @name1, (exists) =>
        @Fs.exists.calledWith("#{@location}/#{@name1Filtered}").should.equal true
        done()

    # fs.exists simply returns false on any error, so...
    it "should not return an error", (done) ->
      @FSPersistorManager.checkIfFileExists @location, @name1, (err,exists) =>
        expect(err).to.be.null
        done()

    it "Should return true for existing files", (done) ->
      @Fs.exists.callsArgWith(1,true)
      @FSPersistorManager.checkIfFileExists @location, @name1, (err,exists) =>
        exists.should.be.true
        done()

    it "Should return false for non-existing files", (done) ->
      @Fs.exists.callsArgWith(1,false)
      @FSPersistorManager.checkIfFileExists @location, @name1, (err,exists) =>
        exists.should.be.false
        done()

  describe "directorySize", ->

    it "should propogate the error", (done) ->
      @Fs.readdir.callsArgWith(1, @error)
      @FSPersistorManager.directorySize @location, @name1, (err, totalsize) =>
        err.should.equal @error
        done()

    it "should sum directory files size", (done) ->
      @Fs.readdir.callsArgWith(1, null, [ {'file1'}, {'file2'} ])
      @Fs.fstatSync.returns({size : 1024})
      @FSPersistorManager.directorySize @location, @name1, (err, totalsize) =>
        expect(totalsize).to.equal 2048
        done()