#include <jni.h>
#include <string.h>
#include "bench_JniCopyBench.h"
#include "bench_JniCopyBench_CallOnly.h"

JNIEXPORT jint JNICALL Java_bench_JniCopyBench_00024CallOnly_echo(
        JNIEnv *env, jclass type, jint value) {
    return value;
}

// Called only by our private benchmark bridge with two distinct arrays of length n.
JNIEXPORT void JNICALL Java_bench_JniCopyBench_copyElements(
        JNIEnv *env, jclass type, jintArray src, jintArray dst, jint n) {
    jint *source = (*env)->GetIntArrayElements(env, src, NULL);
    if (source == NULL) return;
    jint *target = (*env)->GetIntArrayElements(env, dst, NULL);
    if (target == NULL) {
        (*env)->ReleaseIntArrayElements(env, src, source, JNI_ABORT);
        return;
    }
    memcpy(target, source, (size_t)n * sizeof(jint));
    (*env)->ReleaseIntArrayElements(env, dst, target, 0);
    (*env)->ReleaseIntArrayElements(env, src, source, JNI_ABORT);
}

JNIEXPORT void JNICALL Java_bench_JniCopyBench_copyRegions(
        JNIEnv *env, jclass type, jintArray src, jintArray dst, jint n) {
    jint buffer[256];
    for (jint offset = 0; offset < n; offset += 256) {
        jint chunk = n - offset < 256 ? n - offset : 256;
        (*env)->GetIntArrayRegion(env, src, offset, chunk, buffer);
        if ((*env)->ExceptionCheck(env)) return;
        (*env)->SetIntArrayRegion(env, dst, offset, chunk, buffer);
        if ((*env)->ExceptionCheck(env)) return;
    }
}

JNIEXPORT jboolean JNICALL Java_bench_JniCopyBench_elementAccessCopied(
        JNIEnv *env, jclass type, jintArray array) {
    jboolean copied = JNI_FALSE;
    jint *data = (*env)->GetIntArrayElements(env, array, &copied);
    if (data == NULL) return JNI_FALSE;
    (*env)->ReleaseIntArrayElements(env, array, data, JNI_ABORT);
    return copied;
}
