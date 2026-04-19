import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { translateMsysPaths } from "../paths.js";

describe("translateMsysPaths — translates", () => {
  it("leading MSYS prefix at start of string", () => {
    assert.equal(translateMsysPaths("/c/Users/foo"), "C:/Users/foo");
  });

  it("after a space", () => {
    assert.equal(translateMsysPaths("cd /c/Users/foo"), "cd C:/Users/foo");
  });

  it("after a flag `=` boundary", () => {
    assert.equal(
      translateMsysPaths("--path=/d/work/src"),
      "--path=D:/work/src",
    );
  });

  it("inside double quotes", () => {
    assert.equal(
      translateMsysPaths('ls "/c/Program Files/Git"'),
      'ls "C:/Program Files/Git"',
    );
  });

  it("uppercases the drive letter", () => {
    assert.equal(translateMsysPaths("/d/foo"), "D:/foo");
    assert.equal(translateMsysPaths("/z/bar"), "Z:/bar");
  });

  it("only rewrites the leading segment, leaves subsequent slashes", () => {
    assert.equal(
      translateMsysPaths("/c/a/b/c/d"),
      "C:/a/b/c/d",
    );
  });

  it("packed gcc -I flag", () => {
    assert.equal(
      translateMsysPaths("gcc -I/c/include main.c"),
      "gcc -IC:/include main.c",
    );
  });

  it("packed gcc -L flag", () => {
    assert.equal(
      translateMsysPaths("gcc -L/d/lib -lfoo"),
      "gcc -LD:/lib -lfoo",
    );
  });

  it("packed gcc -isystem flag", () => {
    assert.equal(
      translateMsysPaths("gcc -isystem/c/sys main.c"),
      "gcc -isystemC:/sys main.c",
    );
  });

  it("packed -Wl, linker pass-through with comma", () => {
    assert.equal(
      translateMsysPaths("gcc -Wl,/c/lib/foo.a main.c"),
      "gcc -Wl,C:/lib/foo.a main.c",
    );
  });

  it("long flag without `=`: --include/c/foo", () => {
    assert.equal(
      translateMsysPaths("cmd --include/c/foo"),
      "cmd --includeC:/foo",
    );
  });
});

describe("translateMsysPaths — leaves alone", () => {
  it("URLs", () => {
    assert.equal(
      translateMsysPaths("curl https://example.com/c/foo"),
      "curl https://example.com/c/foo",
    );
  });

  it("UNC paths (//server/share)", () => {
    assert.equal(
      translateMsysPaths("ls //server/share/c/foo"),
      "ls //server/share/c/foo",
    );
  });

  it("file:// URLs", () => {
    assert.equal(
      translateMsysPaths("echo file:///c/foo"),
      "echo file:///c/foo",
    );
  });

  it("single-quoted literals", () => {
    assert.equal(
      translateMsysPaths("grep -E '^/c/' file"),
      "grep -E '^/c/' file",
    );
  });

  it("non-flag packed token: arg/c/foo (no leading dash)", () => {
    // Only tokens starting with `-` get packed-flag treatment. Bare
    // `arg/c/foo` could be a literal subpath and stays untouched.
    assert.equal(
      translateMsysPaths("cmd arg/c/foo"),
      "cmd arg/c/foo",
    );
  });

  it("multi-char prefix (/cd/ is not a drive)", () => {
    assert.equal(translateMsysPaths("/cd/foo"), "/cd/foo");
  });

  it("non-letter prefix (/1/)", () => {
    assert.equal(translateMsysPaths("/1/foo"), "/1/foo");
  });
});
