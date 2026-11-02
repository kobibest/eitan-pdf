// PDF Ivrit - Windows Explorer thumbnail provider for .pdf files.
//
// In-process COM server (IInitializeWithStream + IThumbnailProvider).
// PDFium is loaded at runtime from pdfium.dll located in the SAME folder as
// this DLL (never via the default DLL search path), and all PDFium calls are
// serialized with a global lock because PDFium is not thread-safe.
//
// CLSID: {6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}

#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>
#include <objbase.h>
#include <shlobj.h>
#include <propsys.h>
#include <thumbcache.h>

#ifndef SELFREG_E_CLASS  // from olectl.h
#define SELFREG_E_CLASS ((HRESULT)0x80040201L)
#endif

#include <cmath>
#include <cstring>
#include <new>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// GUIDs (defined locally so we do not depend on libuuid)
// ---------------------------------------------------------------------------

// {6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}
static const GUID kClsidPdfIvritThumb = {
    0x6b0c5a9e, 0x3f1d, 0x4e8b, {0x9a, 0x7c, 0x2d, 0x5e, 0x1f, 0x4a, 0x8b, 0x30}};
static const wchar_t kClsidString[] = L"{6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}";
static const wchar_t kFriendlyName[] = L"PDF Ivrit Thumbnail Provider";
// Shell extension handler category for IThumbnailProvider.
static const wchar_t kThumbHandlerKey[] = L"{e357fccd-a995-4576-b01f-234630154e96}";

// {00000000-0000-0000-C000-000000000046}
static const GUID kIID_IUnknown = {
    0x00000000, 0x0000, 0x0000, {0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
// {00000001-0000-0000-C000-000000000046}
static const GUID kIID_IClassFactory = {
    0x00000001, 0x0000, 0x0000, {0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
// {b824b49d-22ac-4161-ac8a-9916e8fa3f7f}
static const GUID kIID_IInitializeWithStream = {
    0xb824b49d, 0x22ac, 0x4161, {0xac, 0x8a, 0x99, 0x16, 0xe8, 0xfa, 0x3f, 0x7f}};
// {e357fccd-a995-4576-b01f-234630154e96}
static const GUID kIID_IThumbnailProvider = {
    0xe357fccd, 0xa995, 0x4576, {0xb0, 0x1f, 0x23, 0x46, 0x30, 0x15, 0x4e, 0x96}};

static inline bool SameGuid(const GUID& a, const GUID& b) {
  return std::memcmp(&a, &b, sizeof(GUID)) == 0;
}

// ---------------------------------------------------------------------------
// Module globals
// ---------------------------------------------------------------------------

static HMODULE g_hModule = nullptr;
static volatile LONG g_cObjects = 0;  // live COM objects (incl. class factories)
static volatile LONG g_cLocks = 0;    // IClassFactory::LockServer count

// One global lock for everything PDFium-related (loading + all calls).
static SRWLOCK g_pdfiumLock = SRWLOCK_INIT;

class PdfiumGuard {
 public:
  PdfiumGuard() { AcquireSRWLockExclusive(&g_pdfiumLock); }
  ~PdfiumGuard() { ReleaseSRWLockExclusive(&g_pdfiumLock); }
  PdfiumGuard(const PdfiumGuard&) = delete;
  PdfiumGuard& operator=(const PdfiumGuard&) = delete;
};

// ---------------------------------------------------------------------------
// PDFium dynamic binding
// ---------------------------------------------------------------------------
// On x64/ARM64 there is a single calling convention, so no __stdcall needed.

typedef void* FPDF_DOCUMENT;
typedef void* FPDF_PAGE;
typedef void* FPDF_BITMAP;

typedef void (*PFN_FPDF_InitLibrary)();
typedef FPDF_DOCUMENT (*PFN_FPDF_LoadMemDocument)(const void*, int, const char*);
typedef int (*PFN_FPDF_GetPageCount)(FPDF_DOCUMENT);
typedef FPDF_PAGE (*PFN_FPDF_LoadPage)(FPDF_DOCUMENT, int);
typedef float (*PFN_FPDF_GetPageWidthF)(FPDF_PAGE);
typedef float (*PFN_FPDF_GetPageHeightF)(FPDF_PAGE);
typedef FPDF_BITMAP (*PFN_FPDFBitmap_Create)(int, int, int);
typedef int (*PFN_FPDFBitmap_FillRect)(FPDF_BITMAP, int, int, int, int, unsigned long);
typedef void (*PFN_FPDF_RenderPageBitmap)(FPDF_BITMAP, FPDF_PAGE, int, int, int, int, int, int);
typedef void* (*PFN_FPDFBitmap_GetBuffer)(FPDF_BITMAP);
typedef int (*PFN_FPDFBitmap_GetStride)(FPDF_BITMAP);
typedef void (*PFN_FPDFBitmap_Destroy)(FPDF_BITMAP);
typedef void (*PFN_FPDF_ClosePage)(FPDF_PAGE);
typedef void (*PFN_FPDF_CloseDocument)(FPDF_DOCUMENT);

struct PdfiumApi {
  PFN_FPDF_InitLibrary InitLibrary;
  PFN_FPDF_LoadMemDocument LoadMemDocument;
  PFN_FPDF_GetPageCount GetPageCount;  // optional
  PFN_FPDF_LoadPage LoadPage;
  PFN_FPDF_GetPageWidthF GetPageWidthF;
  PFN_FPDF_GetPageHeightF GetPageHeightF;
  PFN_FPDFBitmap_Create BitmapCreate;
  PFN_FPDFBitmap_FillRect BitmapFillRect;
  PFN_FPDF_RenderPageBitmap RenderPageBitmap;
  PFN_FPDFBitmap_GetBuffer BitmapGetBuffer;
  PFN_FPDFBitmap_GetStride BitmapGetStride;
  PFN_FPDFBitmap_Destroy BitmapDestroy;
  PFN_FPDF_ClosePage ClosePage;
  PFN_FPDF_CloseDocument CloseDocument;
};

static PdfiumApi g_pdf = {};
static bool g_pdfLoadAttempted = false;  // guarded by g_pdfiumLock
static bool g_pdfReady = false;          // guarded by g_pdfiumLock

// Full path of this DLL (empty on failure).
static std::wstring GetOwnModulePath() {
  HMODULE self = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                              GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          reinterpret_cast<LPCWSTR>(&GetOwnModulePath), &self) ||
      !self) {
    self = g_hModule;
  }
  if (!self) return std::wstring();
  std::vector<wchar_t> buf(MAX_PATH);
  for (int attempt = 0; attempt < 8; ++attempt) {
    DWORD n = GetModuleFileNameW(self, buf.data(), static_cast<DWORD>(buf.size()));
    if (n == 0) return std::wstring();
    if (n < buf.size()) return std::wstring(buf.data(), n);
    buf.resize(buf.size() * 2);  // truncated; grow and retry
  }
  return std::wstring();
}

template <typename T>
static bool Bind(HMODULE mod, const char* name, T* out) {
  FARPROC p = GetProcAddress(mod, name);
  *out = reinterpret_cast<T>(reinterpret_cast<void*>(p));
  return p != nullptr;
}

// Must be called with g_pdfiumLock held. Loads pdfium.dll at most once per
// process lifetime of this module; never unloads it, never destroys the lib.
static bool EnsurePdfiumLocked() {
  if (g_pdfLoadAttempted) return g_pdfReady;
  g_pdfLoadAttempted = true;

  std::wstring path = GetOwnModulePath();
  size_t slash = path.find_last_of(L"\\/");
  if (path.empty() || slash == std::wstring::npos) return false;
  path.resize(slash + 1);
  path += L"pdfium.dll";

  // Full path + LOAD_WITH_ALTERED_SEARCH_PATH: pdfium.dll's own dependencies
  // (system DLLs only) resolve relative to its folder, not the host's.
  HMODULE mod = LoadLibraryExW(path.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!mod) return false;

  PdfiumApi api = {};
  bool ok = true;
  ok &= Bind(mod, "FPDF_InitLibrary", &api.InitLibrary);
  ok &= Bind(mod, "FPDF_LoadMemDocument", &api.LoadMemDocument);
  Bind(mod, "FPDF_GetPageCount", &api.GetPageCount);  // optional
  ok &= Bind(mod, "FPDF_LoadPage", &api.LoadPage);
  ok &= Bind(mod, "FPDF_GetPageWidthF", &api.GetPageWidthF);
  ok &= Bind(mod, "FPDF_GetPageHeightF", &api.GetPageHeightF);
  ok &= Bind(mod, "FPDFBitmap_Create", &api.BitmapCreate);
  ok &= Bind(mod, "FPDFBitmap_FillRect", &api.BitmapFillRect);
  ok &= Bind(mod, "FPDF_RenderPageBitmap", &api.RenderPageBitmap);
  ok &= Bind(mod, "FPDFBitmap_GetBuffer", &api.BitmapGetBuffer);
  ok &= Bind(mod, "FPDFBitmap_GetStride", &api.BitmapGetStride);
  ok &= Bind(mod, "FPDFBitmap_Destroy", &api.BitmapDestroy);
  ok &= Bind(mod, "FPDF_ClosePage", &api.ClosePage);
  ok &= Bind(mod, "FPDF_CloseDocument", &api.CloseDocument);
  if (!ok) {
    FreeLibrary(mod);  // never initialized, safe to unload
    return false;
  }

  // pdfium.dll is intentionally kept loaded (no FreeLibrary) and
  // FPDF_DestroyLibrary is intentionally never called. If this DLL is
  // unloaded and reloaded, LoadLibraryExW returns the same module and
  // FPDF_InitLibrary is a no-op when already initialized.
  api.InitLibrary();
  g_pdf = api;
  g_pdfReady = true;
  return true;
}

// ---------------------------------------------------------------------------
// RAII holders for PDFium handles (used only while g_pdfiumLock is held)
// ---------------------------------------------------------------------------

struct DocHolder {
  FPDF_DOCUMENT h = nullptr;
  ~DocHolder() { if (h) g_pdf.CloseDocument(h); }
};
struct PageHolder {
  FPDF_PAGE h = nullptr;
  ~PageHolder() { if (h) g_pdf.ClosePage(h); }
};
struct BitmapHolder {
  FPDF_BITMAP h = nullptr;
  ~BitmapHolder() { if (h) g_pdf.BitmapDestroy(h); }
};
struct GdiBitmapHolder {
  HBITMAP h = nullptr;
  ~GdiBitmapHolder() { if (h) DeleteObject(h); }
  HBITMAP release() { HBITMAP r = h; h = nullptr; return r; }
};

// ---------------------------------------------------------------------------
// Thumbnail provider
// ---------------------------------------------------------------------------

static const ULONGLONG kMaxPdfBytes = 200ull * 1024 * 1024;  // 200 MB
static const UINT kMaxThumbSide = 4096;

class PdfThumbProvider final : public IInitializeWithStream, public IThumbnailProvider {
 public:
  PdfThumbProvider() : m_ref(1), m_initialized(false) { InterlockedIncrement(&g_cObjects); }

  // IUnknown
  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    if (SameGuid(riid, kIID_IUnknown) || SameGuid(riid, kIID_IInitializeWithStream)) {
      *ppv = static_cast<IInitializeWithStream*>(this);
    } else if (SameGuid(riid, kIID_IThumbnailProvider)) {
      *ppv = static_cast<IThumbnailProvider*>(this);
    } else {
      return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override {
    return static_cast<ULONG>(InterlockedIncrement(&m_ref));
  }
  IFACEMETHODIMP_(ULONG) Release() override {
    LONG r = InterlockedDecrement(&m_ref);
    if (r == 0) delete this;
    return static_cast<ULONG>(r);
  }

  // IInitializeWithStream
  IFACEMETHODIMP Initialize(IStream* stream, DWORD /*grfMode*/) override {
    try {
      if (!stream) return E_INVALIDARG;
      if (m_initialized) return HRESULT_FROM_WIN32(ERROR_ALREADY_INITIALIZED);

      std::vector<unsigned char> data;
      STATSTG st = {};
      if (SUCCEEDED(stream->Stat(&st, STATFLAG_NONAME))) {
        if (st.cbSize.QuadPart > kMaxPdfBytes) return E_FAIL;
        // +1 chunk: the read loop always grows by a full chunk before reading.
        data.reserve(static_cast<size_t>(st.cbSize.QuadPart) + 256 * 1024);
      }

      const ULONG kChunk = 256 * 1024;
      for (;;) {
        size_t old = data.size();
        if (old + kChunk > kMaxPdfBytes + kChunk) return E_FAIL;  // defensive
        data.resize(old + kChunk);
        ULONG got = 0;
        HRESULT hr = stream->Read(data.data() + old, kChunk, &got);
        if (FAILED(hr)) return hr;
        if (got > kChunk) return E_FAIL;  // misbehaving stream
        data.resize(old + got);
        if (data.size() > kMaxPdfBytes) return E_FAIL;
        if (hr != S_OK || got == 0) break;  // S_FALSE or nothing read => EOF
      }
      if (data.empty()) return E_FAIL;

      m_data.swap(data);
      m_initialized = true;
      return S_OK;
    } catch (...) {
      return E_FAIL;
    }
  }

  // IThumbnailProvider
  IFACEMETHODIMP GetThumbnail(UINT cx, HBITMAP* phbmp, WTS_ALPHATYPE* pdwAlpha) override {
    if (phbmp) *phbmp = nullptr;
    if (pdwAlpha) *pdwAlpha = WTSAT_UNKNOWN;
    if (!phbmp || !pdwAlpha) return E_POINTER;
    if (cx == 0) return E_INVALIDARG;
    if (!m_initialized || m_data.empty()) return E_UNEXPECTED;
    if (cx > kMaxThumbSide) cx = kMaxThumbSide;
    try {
      return Render(cx, phbmp, pdwAlpha);
    } catch (...) {
      if (*phbmp) {  // defensive; Render only sets it on success
        DeleteObject(*phbmp);
        *phbmp = nullptr;
      }
      return E_FAIL;
    }
  }

 private:
  ~PdfThumbProvider() { InterlockedDecrement(&g_cObjects); }

  HRESULT Render(UINT cx, HBITMAP* phbmp, WTS_ALPHATYPE* pdwAlpha) {
    if (m_data.size() > static_cast<size_t>(0x7fffffff)) return E_FAIL;

    PdfiumGuard lock;
    if (!EnsurePdfiumLocked()) return E_FAIL;

    // Declaration order matters: destructors run in reverse, so the bitmap and
    // page are released before the document is closed.
    DocHolder doc;
    doc.h = g_pdf.LoadMemDocument(m_data.data(), static_cast<int>(m_data.size()), nullptr);
    if (!doc.h) return E_FAIL;  // corrupt or password-protected

    if (g_pdf.GetPageCount && g_pdf.GetPageCount(doc.h) < 1) return E_FAIL;

    PageHolder page;
    page.h = g_pdf.LoadPage(doc.h, 0);
    if (!page.h) return E_FAIL;

    const double pw = g_pdf.GetPageWidthF(page.h);
    const double ph = g_pdf.GetPageHeightF(page.h);
    if (!(pw > 0.0) || !(ph > 0.0) || !std::isfinite(pw) || !std::isfinite(ph)) return E_FAIL;

    const double scale = static_cast<double>(cx) / (pw >= ph ? pw : ph);
    long w = std::lround(pw * scale);
    long h = std::lround(ph * scale);
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    if (w > static_cast<long>(cx)) w = static_cast<long>(cx);
    if (h > static_cast<long>(cx)) h = static_cast<long>(cx);
    const int width = static_cast<int>(w);
    const int height = static_cast<int>(h);

    BitmapHolder bmp;
    bmp.h = g_pdf.BitmapCreate(width, height, 0 /* no alpha: BGRx */);
    if (!bmp.h) return E_OUTOFMEMORY;
    g_pdf.BitmapFillRect(bmp.h, 0, 0, width, height, 0xFFFFFFFFul);
    g_pdf.RenderPageBitmap(bmp.h, page.h, 0, 0, width, height, 0 /* rotate */,
                           0x01 /* FPDF_ANNOT */);

    const unsigned char* src = static_cast<const unsigned char*>(g_pdf.BitmapGetBuffer(bmp.h));
    const int srcStride = g_pdf.BitmapGetStride(bmp.h);
    const size_t rowBytes = static_cast<size_t>(width) * 4;
    if (!src || srcStride < 0 || static_cast<size_t>(srcStride) < rowBytes) return E_FAIL;

    BITMAPINFO bi = {};
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = width;
    bi.bmiHeader.biHeight = -height;  // top-down
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;

    void* bits = nullptr;
    GdiBitmapHolder dib;
    dib.h = CreateDIBSection(nullptr, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
    if (!dib.h || !bits) return E_OUTOFMEMORY;

    // 32bpp DIB rows are always DWORD aligned: stride == width * 4.
    unsigned char* dst = static_cast<unsigned char*>(bits);
    for (int y = 0; y < height; ++y) {
      const unsigned char* s = src + static_cast<size_t>(y) * static_cast<size_t>(srcStride);
      unsigned char* d = dst + static_cast<size_t>(y) * rowBytes;
      std::memcpy(d, s, rowBytes);
      for (size_t x = 3; x < rowBytes; x += 4) d[x] = 0xFF;  // opaque
    }
    GdiFlush();

    *phbmp = dib.release();
    *pdwAlpha = WTSAT_RGB;
    return S_OK;
  }

  volatile LONG m_ref;
  bool m_initialized;
  std::vector<unsigned char> m_data;  // must outlive any FPDF_DOCUMENT made from it
};

// ---------------------------------------------------------------------------
// Class factory
// ---------------------------------------------------------------------------

class PdfThumbClassFactory final : public IClassFactory {
 public:
  PdfThumbClassFactory() : m_ref(1) { InterlockedIncrement(&g_cObjects); }

  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    if (SameGuid(riid, kIID_IUnknown) || SameGuid(riid, kIID_IClassFactory)) {
      *ppv = static_cast<IClassFactory*>(this);
      AddRef();
      return S_OK;
    }
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override {
    return static_cast<ULONG>(InterlockedIncrement(&m_ref));
  }
  IFACEMETHODIMP_(ULONG) Release() override {
    LONG r = InterlockedDecrement(&m_ref);
    if (r == 0) delete this;
    return static_cast<ULONG>(r);
  }

  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    if (outer) return CLASS_E_NOAGGREGATION;
    try {
      PdfThumbProvider* obj = new (std::nothrow) PdfThumbProvider();
      if (!obj) return E_OUTOFMEMORY;
      HRESULT hr = obj->QueryInterface(riid, ppv);
      obj->Release();  // balances the initial ref; QI holds its own on success
      return hr;
    } catch (...) {
      return E_FAIL;
    }
  }
  IFACEMETHODIMP LockServer(BOOL lock) override {
    if (lock) InterlockedIncrement(&g_cLocks);
    else InterlockedDecrement(&g_cLocks);
    return S_OK;
  }

 private:
  ~PdfThumbClassFactory() { InterlockedDecrement(&g_cObjects); }
  volatile LONG m_ref;
};

// ---------------------------------------------------------------------------
// Registration helpers (per-user, HKCU\Software\Classes)
// ---------------------------------------------------------------------------

static HRESULT SetRegString(HKEY root, const std::wstring& subkey, const wchar_t* valueName,
                            const std::wstring& data) {
  HKEY key = nullptr;
  LONG rc = RegCreateKeyExW(root, subkey.c_str(), 0, nullptr, REG_OPTION_NON_VOLATILE,
                            KEY_SET_VALUE, nullptr, &key, nullptr);
  if (rc != ERROR_SUCCESS) return HRESULT_FROM_WIN32(rc);
  rc = RegSetValueExW(key, valueName, 0, REG_SZ, reinterpret_cast<const BYTE*>(data.c_str()),
                      static_cast<DWORD>((data.size() + 1) * sizeof(wchar_t)));
  RegCloseKey(key);
  return rc == ERROR_SUCCESS ? S_OK : HRESULT_FROM_WIN32(rc);
}

// Reads the default (unnamed) REG_SZ value of root\subkey.
static bool GetRegDefaultString(HKEY root, const std::wstring& subkey, std::wstring* out) {
  HKEY key = nullptr;
  if (RegOpenKeyExW(root, subkey.c_str(), 0, KEY_QUERY_VALUE, &key) != ERROR_SUCCESS) return false;
  DWORD type = 0, size = 0;
  LONG rc = RegQueryValueExW(key, nullptr, nullptr, &type, nullptr, &size);
  bool ok = false;
  if (rc == ERROR_SUCCESS && (type == REG_SZ || type == REG_EXPAND_SZ) && size < 4096) {
    std::vector<wchar_t> buf(size / sizeof(wchar_t) + 2, L'\0');
    DWORD size2 = static_cast<DWORD>((buf.size() - 1) * sizeof(wchar_t));
    rc = RegQueryValueExW(key, nullptr, nullptr, &type, reinterpret_cast<BYTE*>(buf.data()), &size2);
    if (rc == ERROR_SUCCESS) {
      *out = std::wstring(buf.data());  // stops at first NUL
      ok = true;
    }
  }
  RegCloseKey(key);
  return ok;
}

static const wchar_t kClassesRoot[] = L"Software\\Classes\\";

static std::wstring ClsidKey() { return std::wstring(kClassesRoot) + L"CLSID\\" + kClsidString; }
static std::wstring ShellExKey(const wchar_t* prefix) {
  return std::wstring(kClassesRoot) + prefix + L"\\ShellEx\\" + kThumbHandlerKey;
}
static const wchar_t* const kShellExPrefixes[] = {L".pdf", L"SystemFileAssociations\\.pdf"};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

extern "C" BOOL WINAPI DllMain(HINSTANCE hinst, DWORD reason, LPVOID /*reserved*/) {
  if (reason == DLL_PROCESS_ATTACH) {
    g_hModule = hinst;
    DisableThreadLibraryCalls(hinst);
  }
  return TRUE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, LPVOID* ppv) {
  if (!ppv) return E_POINTER;
  *ppv = nullptr;
  if (!SameGuid(rclsid, kClsidPdfIvritThumb)) return CLASS_E_CLASSNOTAVAILABLE;
  try {
    PdfThumbClassFactory* f = new (std::nothrow) PdfThumbClassFactory();
    if (!f) return E_OUTOFMEMORY;
    HRESULT hr = f->QueryInterface(riid, ppv);
    f->Release();
    return hr;
  } catch (...) {
    return E_FAIL;
  }
}

STDAPI DllCanUnloadNow(void) {
  return (g_cObjects == 0 && g_cLocks == 0) ? S_OK : S_FALSE;
}

STDAPI DllRegisterServer(void) {
  try {
    std::wstring dllPath = GetOwnModulePath();
    if (dllPath.empty()) return SELFREG_E_CLASS;

    HRESULT hr = SetRegString(HKEY_CURRENT_USER, ClsidKey(), nullptr, kFriendlyName);
    if (SUCCEEDED(hr))
      hr = SetRegString(HKEY_CURRENT_USER, ClsidKey() + L"\\InprocServer32", nullptr, dllPath);
    if (SUCCEEDED(hr))
      hr = SetRegString(HKEY_CURRENT_USER, ClsidKey() + L"\\InprocServer32", L"ThreadingModel",
                        L"Apartment");
    for (const wchar_t* prefix : kShellExPrefixes) {
      if (FAILED(hr)) break;
      hr = SetRegString(HKEY_CURRENT_USER, ShellExKey(prefix), nullptr, kClsidString);
    }
    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    return SUCCEEDED(hr) ? S_OK : SELFREG_E_CLASS;
  } catch (...) {
    return SELFREG_E_CLASS;
  }
}

STDAPI DllUnregisterServer(void) {
  try {
    // ShellEx handler keys: only remove them if they still point at us.
    for (const wchar_t* prefix : kShellExPrefixes) {
      std::wstring key = ShellExKey(prefix);
      std::wstring value;
      if (GetRegDefaultString(HKEY_CURRENT_USER, key, &value) &&
          CompareStringOrdinal(value.c_str(), -1, kClsidString, -1, TRUE) == CSTR_EQUAL) {
        RegDeleteTreeW(HKEY_CURRENT_USER, key.c_str());
      }
    }
    // Our CLSID key belongs exclusively to us.
    LONG rc = RegDeleteTreeW(HKEY_CURRENT_USER, ClsidKey().c_str());
    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    if (rc != ERROR_SUCCESS && rc != ERROR_FILE_NOT_FOUND) return SELFREG_E_CLASS;
    return S_OK;
  } catch (...) {
    return SELFREG_E_CLASS;
  }
}
