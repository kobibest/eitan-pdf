; איתןPDF — תוכנת התקנה
; התקנה למשתמש הנוכחי בלבד (בלי הרשאות מנהל). התקנה של גרסה חדשה מעדכנת את הקיימת
; באותה תיקייה, ושומרת הגדרות וחתימות (הן נשמרות בנפרד, ב-AppData).

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef ARCH
  !define ARCH "x64"
!endif
!ifndef SRCDIR
  !define SRCDIR "..\dist\win-unpacked"
!endif

!define APPNAME "איתןPDF"
!define EXE "EitanPDF.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\EitanPDF"

Name "${APPNAME}"
Caption "התקנת ${APPNAME} ${VERSION}"
OutFile "..\dist\EitanPDF-Setup-${VERSION}-${ARCH}.exe"
InstallDir "$LOCALAPPDATA\Programs\EitanPDF"
InstallDirRegKey HKCU "Software\EitanPDF" "InstallDir"
BrandingText "${APPNAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1037 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1037 "FileDescription" "התקנת ${APPNAME}"
VIAddVersionKey /LANG=1037 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1037 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1037 "CompanyName" "Kobi Eitan"
VIAddVersionKey /LANG=1037 "LegalCopyright" "MIT"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "ברוכים הבאים ל${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "תוכנה חינמית לעבודה עם קבצי PDF בעברית: צפייה, חתימה, מילוי טפסים, מיזוג ופיצול.$\r$\n$\r$\nאם כבר מותקנת גרסה קודמת, היא תעודכן. ההגדרות והחתימות השמורות שלכם יישארו.$\r$\n$\r$\nלחצו $\"הבא$\" כדי להמשיך."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "פתיחת ${APPNAME} עכשיו"
!define MUI_FINISHPAGE_TITLE "${APPNAME} מוכנה"
!define MUI_FINISHPAGE_TEXT "ההתקנה הסתיימה. התוכנה נמצאת בתפריט התחל ועל שולחן העבודה."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Hebrew"

; ---------- סגירת התוכנה אם היא פתוחה ----------
!macro CLOSE_APP UN
Function ${UN}CloseApp
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq ${EXE}" /NH | find /I "${EXE}"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "${APPNAME} פתוחה כרגע.$\r$\n$\r$\nשמרו את העבודה ולחצו $\"אישור$\" כדי לסגור אותה ולהמשיך." IDOK +2
    Abort
    nsExec::Exec 'taskkill /IM "${EXE}"'
    Sleep 2500
    nsExec::Exec 'taskkill /F /IM "${EXE}"'
    Sleep 800
  ${EndIf}
FunctionEnd
!macroend
!insertmacro CLOSE_APP ""
!insertmacro CLOSE_APP "un."

Section "Install"
  Call CloseApp
  ; מוחקים את הגרסה הקודמת של קבצי התוכנה (לא את ההגדרות) ומתקינים מחדש
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0

  WriteRegStr HKCU "Software\EitanPDF" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Kobi Eitan"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  Call un.CloseApp
  ; מסירים קליק ימני, תמונות ממוזערות ו"פתח באמצעות" שהתוכנה רשמה
  ExecWait '"$INSTDIR\${EXE}" --uninstall-integration'
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\EitanPDF"
SectionEnd
