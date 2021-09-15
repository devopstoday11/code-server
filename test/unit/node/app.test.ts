import { logger } from "@coder/logger"
import { promises, rmdirSync } from "fs"
import * as http from "http"
import * as https from "https"
import * as path from "path"
import { createApp, ensureAddress, handleArgsSocketCatchError, handleServerError } from "../../../src/node/app"
import { OptionalString, setDefaults } from "../../../src/node/cli"
import { getAvailablePort, tmpdir } from "../../utils/helpers"

describe("createApp", () => {
  let spy: jest.SpyInstance
  let unlinkSpy: jest.SpyInstance

  beforeEach(() => {
    // https://github.com/aelbore/esbuild-jest/issues/26#issuecomment-893763840
    // explain why we do it this way
    spy = jest.spyOn(logger, "error")
    unlinkSpy = jest.spyOn(promises, "unlink")
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  // TODO@jsjoeio refactor to use beforeEach and afterEach
  it("should return an Express app, a WebSockets Express app and an http server", async () => {
    const port = await getAvailablePort()
    const defaultArgs = await setDefaults({
      port,
      _: [],
    })
    const [app, wsApp, server] = await createApp(defaultArgs)

    // This doesn't check much, but it's a good sanity check
    // to ensure we actually get back values from createApp
    expect(app).not.toBeNull()
    expect(wsApp).not.toBeNull()
    expect(server).toBeInstanceOf(http.Server)

    // Cleanup
    server.close()
  })

  it("should handle error events on the server", async () => {
    const port = await getAvailablePort()
    const defaultArgs = await setDefaults({
      port,
      _: [],
    })

    // This looks funky, but that's because createApp
    // returns an array like [app, wsApp, server]
    // We only need server which is at index 2
    // we do it this way so ESLint is happy that we're
    // have no declared variables not being used
    const app = await createApp(defaultArgs)
    const server = app[2]

    const testError = new Error("Test error")
    // Emitting error events on servers
    // https://stackoverflow.com/a/33872506/3015595
    server.emit("error", testError)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(`http server error: ${testError.message} ${testError.stack}`)

    // Cleanup
    server.close()
  })

  it("should reject errors", async () => {
    const port = 2
    const defaultArgs = await setDefaults({
      port,
      _: [],
    })

    // This looks funky, but that's because createApp
    // returns an array like [app, wsApp, server]
    // We only need server which is at index 2
    // we do it this way so ESLint is happy that we're
    // have no declared variables not being used
    async function masterBall() {
      const app = await createApp(defaultArgs)
      const server = app[2]

      const testError = new Error("Test error")
      // Emitting error events on servers
      // https://stackoverflow.com/a/33872506/3015595
      server.emit("error", testError)
      // expect(spy).toHaveBeenCalledTimes(1)
      // expect(spy).toHaveBeenCalledWith(`http server error: ${testError.message} ${testError.stack}`)

      // Cleanup
      server.close()
    }

    expect(() => masterBall()).rejects.toThrow(`listen EACCES: permission denied 127.0.0.1:${port}`)
  })

  it("should unlink a socket before listening on the socket", async () => {
    const tmpDir = await tmpdir("unlink-socket")
    const tmpFile = path.join(tmpDir, "unlink-socket-file")
    await promises.writeFile(tmpFile, "")
    const socketPath = tmpFile
    const defaultArgs = await setDefaults({
      _: [],
      socket: socketPath,
    })

    const app = await createApp(defaultArgs)
    const server = app[2]

    expect(unlinkSpy).toHaveBeenCalledTimes(1)
    // Ensure directory was removed
    rmdirSync(socketPath, { recursive: true })
    server.close()
  })
  it("should catch errors thrown when unlinking a socket", async () => {
    const tmpDir = await tmpdir("unlink-socket")
    const tmpFile = path.join(tmpDir, "unlink-socket-file")
    // await promises.writeFile(tmpFile, "")
    const socketPath = tmpFile
    const defaultArgs = await setDefaults({
      _: [],
      socket: socketPath,
    })

    const app = await createApp(defaultArgs)
    const server = app[2]

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(`ENOENT: no such file or directory, unlink '${socketPath}'`)
    // Ensure directory was removed
    rmdirSync(socketPath, { recursive: true })
    server.close()
  })

  it("should create an https server if args.cert exists", async () => {
    // No idea why we have this weird optional string thing
    const port = await getAvailablePort()
    const cert = new OptionalString("./test/utils/test.crt")
    const defaultArgs = await setDefaults({
      port,
      cert,
      _: [],
      ["cert-key"]: "./test/utils/test.key",
    })
    const app = await createApp(defaultArgs)
    const server = app[2]

    // This doesn't check much, but it's a good sanity check
    // to ensure we actually get back values from createApp
    expect(server).toBeInstanceOf(https.Server)

    // Cleanup
    server.close()
  })
})

describe("ensureAddress", () => {
  let mockServer: http.Server

  beforeEach(() => {
    mockServer = http.createServer()
  })

  afterEach(() => {
    mockServer.close()
  })

  it("should throw and error if no address", () => {
    expect(() => ensureAddress(mockServer)).toThrow("server has no address")
  })
  it("should return the address if it exists and not a string", async () => {
    const port = await getAvailablePort()
    mockServer.listen(port)
    const address = ensureAddress(mockServer)
    expect(address).toBe(`http://:::${port}`)
  })
  it("should return the address if it exists", async () => {
    mockServer.address = () => "http://localhost:8080"
    const address = ensureAddress(mockServer)
    expect(address).toBe(`http://localhost:8080`)
  })
})

describe("handleServerError", () => {
  let spy: jest.SpyInstance

  beforeEach(() => {
    spy = jest.spyOn(logger, "error")
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  it("should call reject if resolved is false", async () => {
    const resolved = false
    const reject = jest.fn((err: Error) => undefined)
    const error = new Error("handleServerError Error")

    handleServerError(resolved, error, reject)

    expect(reject).toHaveBeenCalledTimes(1)
    expect(reject).toHaveBeenCalledWith(error)
  })

  it("should log an error if resolved is true", async () => {
    const resolved = true
    const reject = jest.fn((err: Error) => undefined)
    const error = new Error("handleServerError Error")

    handleServerError(resolved, error, reject)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toThrowErrorMatchingSnapshot()
  })
})

// TODO@jsjoeio - write
// make a file owned by root
// restrictive permissions - 600
// no one else can touch it besides root

// make the socket on the file path and i'll get that..

// create a directory and pass that in as the socket
// with one file and use the directory as the socket path

// The other thing I can do is mock fs.unlink
// and make it throw an error
// Stopped

describe("handleArgsSocketCatchError", () => {
  let spy: jest.SpyInstance

  beforeEach(() => {
    spy = jest.spyOn(logger, "error")
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  it("should log an error if its not an isNodeJSErrnoException", () => {
    const error = new Error()

    handleArgsSocketCatchError(error)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(error)
  })

  it("should log an error if its not an isNodeJSErrnoException (and the error has a message)", () => {
    const errorMessage = "handleArgsSocketCatchError Error"
    const error = new Error(errorMessage)

    handleArgsSocketCatchError(error)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(errorMessage)
  })

  it("should not log an error if its a isNodeJSErrnoException", () => {
    const error: NodeJS.ErrnoException = new Error()
    error.code = "ENOENT"

    handleArgsSocketCatchError(error)

    expect(spy).toHaveBeenCalledTimes(0)
  })

  it("should log an error if the code is not ENOENT (and the error has a message)", () => {
    const errorMessage = "no access"
    const error: NodeJS.ErrnoException = new Error()
    error.code = "EACCESS"
    error.message = errorMessage

    handleArgsSocketCatchError(error)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(errorMessage)
  })

  it("should log an error if the code is not ENOENT", () => {
    const error: NodeJS.ErrnoException = new Error()
    error.code = "EACCESS"

    handleArgsSocketCatchError(error)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(error)
  })
})
