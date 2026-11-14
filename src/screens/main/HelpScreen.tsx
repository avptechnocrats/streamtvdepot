import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { InputField } from "@/components/common/InputField";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { RootStackParamList } from "@/navigation/types";
import { createTicket, fetchMyTickets } from "@/services/supportService";
import { colors } from "@/theme/colors";

export function HelpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ["tickets"], queryFn: () => fetchMyTickets(1) });

  const createMutation = useMutation({
    mutationFn: () => createTicket({ title, description, priority: "medium" }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["tickets"] }).catch(() => undefined);
      Alert.alert("Ticket submitted", "Support request has been created.");
    },
    onError: () => {
      Alert.alert("Submission failed", "Could not submit your support request.");
    },
  });

  return (
    <Screen>
      <BackTitleHeader
        title="Help and Support"
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }
          navigation.navigate("Main", { screen: "Account" } as never);
        }}
      />
      <View style={styles.form}>
        <InputField label="Issue title" value={title} onChangeText={setTitle} />
        <InputField label="Describe your issue" value={description} onChangeText={setDescription} multiline numberOfLines={4} />
        <PrimaryButton
          label={createMutation.isPending ? "Submitting..." : "Raise Ticket"}
          onPress={() => createMutation.mutate()}
          disabled={createMutation.isPending || !title || !description}
        />
      </View>

      <Text style={styles.subHeading}>My Tickets</Text>
      <FlatList
        data={data?.items || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.ticket}>
            <Text style={styles.ticketTitle}>{item.title}</Text>
            <Text style={styles.ticketMeta}>{item.status} • {item.priority}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10, marginTop: 14 },
  subHeading: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", marginTop: 24 },
  list: { gap: 10, paddingTop: 10, paddingBottom: 30 },
  ticket: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 4,
  },
  ticketTitle: { color: colors.textPrimary, fontWeight: "700" },
  ticketMeta: { color: colors.textSecondary, fontSize: 12 },
});
