#include <jni.h>

JNIEXPORT void JNICALL Java_PinProbe_callback(JNIEnv *env, jclass probe) {
    jmethodID method = (*env)->GetStaticMethodID(env, probe, "waitInJava", "()V");
    if (method != NULL) (*env)->CallStaticVoidMethod(env, probe, method);
}
