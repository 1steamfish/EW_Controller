QT += core gui widgets serialport charts

greaterThan(QT_MAJOR_VERSION, 4): QT += widgets

CONFIG += c++17

TARGET   = EW_Controller
TEMPLATE = app

DEFINES += QT_DEPRECATED_WARNINGS

SOURCES += \
    main.cpp \
    mainwindow.cpp \
    chartwidget.cpp \
    ecpcodec.cpp \
    crc.cpp \
    cobs.cpp \
    serialtransport.cpp \
    ecpcontroller.cpp

HEADERS += \
    mainwindow.h \
    chartwidget.h \
    ecpframe.h \
    ecpcodec.h \
    crc.h \
    cobs.h \
    serialtransport.h \
    ecpcontroller.h

# Default rules for deployment.
qnx: target.path = /tmp/$${TARGET}/bin
else: unix:!android: target.path = /opt/$${TARGET}/bin
!isEmpty(target.path): INSTALLS += target
