import { describe, expect, it } from "vitest";
import { createSseParser, readEventStream } from "../copilot-stream";
import { sseResponse } from "@/test/sse-response";

function parse(chunks: string[]): string[] {
  const received: string[] = [];
  const parser = createSseParser((data) => received.push(data));
  for (const chunk of chunks) parser.push(chunk);
  return received;
}

describe("createSseParser", () => {
  it("delivers the data of each complete event", () => {
    expect(parse(['data: {"type":"delta","delta":"{"}\n\n'])).toEqual(['{"type":"delta","delta":"{"}']);
  });

  it("joins an event split across chunks, even mid-line and mid-separator", () => {
    expect(parse(['da', 'ta: {"type":"del', 'ta"}\n', '\ndata: {"type":"done"}\n\n'])).toEqual([
      '{"type":"delta"}',
      '{"type":"done"}',
    ]);
  });

  it("delivers several events that arrive in one chunk, in order", () => {
    expect(parse(["data: 1\n\ndata: 2\n\ndata: 3\n\n"])).toEqual(["1", "2", "3"]);
  });

  it("ignores comments and the other fields, and events without data", () => {
    expect(parse([": stream aberto\n\nevent: error\nid: 7\nretry: 1000\ndata: x\n\n:\n\n"])).toEqual(["x"]);
  });

  it("accepts CRLF line endings, split between chunks", () => {
    expect(parse(["data: a\r\n", "\r\ndata: b\r\n\r\n"])).toEqual(["a", "b"]);
  });

  it("joins multi-line data with a newline", () => {
    expect(parse(["data: linha 1\ndata: linha 2\n\n"])).toEqual(["linha 1\nlinha 2"]);
  });

  it("waits for the blank line before delivering an event", () => {
    expect(parse(['data: {"type":"done"}\n'])).toEqual([]);
  });
});

describe("readEventStream", () => {
  it("decodes an accented character split between two byte chunks", async () => {
    const stream = sseResponse();
    const bytes = new TextEncoder().encode('data: {"delta":"é"}\n\n');
    const split = bytes.indexOf(0xc3) + 1;
    stream.bytes(bytes.slice(0, split));
    stream.bytes(bytes.slice(split));
    stream.close();
    const received: string[] = [];

    await readEventStream(stream.response.body!, (data) => {
      received.push(data);
      return false;
    });

    expect(received).toEqual(['{"delta":"é"}']);
  });

  it("stops reading when the callback asks to, without waiting for the end of the body", async () => {
    const stream = sseResponse();
    stream.event({ type: "delta" });
    stream.event({ type: "done" });
    const received: string[] = [];

    // O corpo nunca fecha: se a leitura não parasse no `done`, o teste travaria.
    await readEventStream(stream.response.body!, (data) => {
      received.push(data);
      return data.includes("done");
    });

    expect(received).toEqual(['{"type":"delta"}', '{"type":"done"}']);
  });

  it("rejects when the connection drops in the middle of the body", async () => {
    const stream = sseResponse();
    stream.raw('data: {"type":"del');
    stream.drop();

    await expect(readEventStream(stream.response.body!, () => false)).rejects.toThrow("network error");
  });
});
