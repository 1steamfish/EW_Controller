#include "mainwindow.h"
#include <QApplication>

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);

    // Application metadata
    app.setApplicationName("EW_Controller");
    app.setApplicationDisplayName(QObject::tr("电化学工作站上位机"));
    app.setOrganizationName("EW");
    app.setApplicationVersion("1.0.0");

    MainWindow w;
    w.show();
    return app.exec();
}
