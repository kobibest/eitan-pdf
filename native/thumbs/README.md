# PdfIvritThumbs - Explorer thumbnail provider for PDF

An in-process COM server that implements `IInitializeWithStream` and `IThumbnailProvider`.
Explorer calls it to draw page 1 of a `.pdf` file as the file's thumbnail. It renders with
PDFium. `pdfium.dll` is loaded at runtime with `LoadLibraryExW`, using the full path of the
folder that holds `PdfIvritThumbs.dll`. The DLL does not link against PDFium's import lib.

## CLSID

```
{6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}
```

## Files to ship (both files must be in the same folder)

| Arch  | Files |
|-------|-------|
| x64   | `dist/PdfIvritThumbs.dll`, `dist/pdfium.dll`, `dist/pdfium-LICENSE.txt` |
| ARM64 | `dist-arm64/PdfIvritThumbs.dll`, `dist-arm64/pdfium.dll`, `dist-arm64/pdfium-LICENSE.txt` |

Install the build that matches the OS architecture, because Explorer only loads a DLL built
for its own architecture. Put the files somewhere that is not inside `app.asar`, for example
`resources/thumbs/` through electron-builder `extraResources`. An in-process DLL cannot be
loaded from inside an asar archive.

## Registry keys (per user, no admin rights needed)

`DllRegisterServer` writes these keys and `DllUnregisterServer` removes them. Run
`regsvr32 /s "<path>\PdfIvritThumbs.dll"` to register and `regsvr32 /s /u ...` to unregister.
The installer can also write the same keys itself:

```
HKCU\Software\Classes\CLSID\{6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}
    (Default)       REG_SZ  PDF Ivrit Thumbnail Provider
HKCU\Software\Classes\CLSID\{6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}\InprocServer32
    (Default)       REG_SZ  C:\full\path\to\PdfIvritThumbs.dll
    ThreadingModel  REG_SZ  Apartment
HKCU\Software\Classes\.pdf\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}
    (Default)       REG_SZ  {6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}
HKCU\Software\Classes\SystemFileAssociations\.pdf\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}
    (Default)       REG_SZ  {6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}
```

After you write or delete these keys, call
`SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, NULL, NULL)`. The register and unregister
functions already make this call.

Unregistering deletes the two `ShellEx\{e357...}` keys only while their default value still
equals our CLSID, so it does not touch another app's handler. It always deletes our own
`CLSID\{6B0C...}` tree. Empty parent `ShellEx` keys are left in place.

Thumbnails that Explorer has already cached may stay until Explorer is restarted or the
thumbnail cache is cleared with Disk Cleanup.

## Behaviour

- Initialize reads the whole stream into memory. Files larger than 200 MB return `E_FAIL`.
- GetThumbnail renders page 0 so that the longer side equals `cx` (capped at 4096 px). It
  fills the page white, renders with `FPDF_ANNOT` only, and returns an opaque top-down 32bpp
  DIB with `WTSAT_RGB`.
- Password-protected or corrupt files return `E_FAIL`, and Explorer then shows the generic icon.
- All PDFium calls run under one global SRW lock. `FPDF_InitLibrary` runs once.
  `FPDF_DestroyLibrary` is never called, and pdfium.dll is never unloaded.
- No C++ exception crosses a COM boundary.

## Build (Linux, cross-compile)

```
./build.sh            # x64 + arm64
./build.sh x64        # x64 only
PDFIUM_TAG=chromium/8125 ./build.sh   # pin the pdfium-binaries release
```

Requires `python3 -m ziglang` (zig 0.17) and curl with access to github.com. The script
compiles `src/thumbs.cpp` together with `src/thumbs.def`, then downloads `pdfium.dll` and
its LICENSE from bblanchon/pdfium-binaries. The PDFium build used now is 158.0.8125.0 (see
`pdfium-VERSION.txt`).

Runtime dependencies: only system DLLs (KERNEL32, ADVAPI32, GDI32, SHELL32) and the UCRT
`api-ms-win-crt-*` DLLs, which are built into Windows 10 and later. libc++ and libunwind are
linked statically.
